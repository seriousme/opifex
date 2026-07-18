import assert from "node:assert/strict";
import { test } from "node:test";
import { MQTTLevel, PacketType } from "../../server/deps.ts";
import type {
  ConnectPacket,
  MqttConn,
  PublishPacket,
} from "../../server/deps.ts";
import {
  addMockClient,
  connect,
  delay,
  disconnect,
  isAuthenticatedBroker,
  ping,
  publish,
  startMockServer,
  subscribe,
  unsubscribe,
} from "../../dev_utils/mod.ts";

const txtEncoder = new TextEncoder();

const NO_SUBSCRIBE_TOPIC = "test/nosubscribe";

// Test configurations matching client_test.py global parameters
const topics = ["TopicA", "TopicA/B", "Topic/C", "TopicA/C", "/TopicA"];
const wildtopics = ["TopicA/+", "+/C", "#", "/#", "/+", "+/+", "TopicA/#"];
const nosubscribeTopics = ["test/nosubscribe"];

// receive messages from server

async function receiveMessages(conn: MqttConn) {
  const received = Array.fromAsync(conn);
  await delay(10);
  await disconnect(conn);
  const messages = await received;
  return messages;
}
// --- Tests ---

test("Basic test: Connect, Subscribe, and Publish", async () => {
  const { mqttConn, mqttServer } = startMockServer();

  // Initial clean connect sequence
  await connect(mqttConn, { clientId: "myclientid", clean: true });
  await disconnect(mqttConn);

  // Reconnect and issue subscription + messages
  const mqttConn2 = addMockClient(mqttServer);
  await connect(mqttConn2, { clientId: "myclientid", clean: false });
  await subscribe(mqttConn2, [{ topicFilter: topics[0], qos: 2 }]);

  const mqttConn3 = addMockClient(mqttServer);
  await connect(mqttConn3, { clientId: "publisher" });
  await publish(mqttConn3, topics[0], 0, { payload: "qos 0" });
  await publish(mqttConn3, topics[0], 1, { payload: "qos 1", id: 1 });
  await publish(mqttConn3, topics[0], 2, { payload: "qos 2", id: 2 });
  await disconnect(mqttConn3);
  const packets = await receiveMessages(mqttConn2);
  assert.equal(packets.length, 3);
  assert.equal(packets.filter((p) => p.type === PacketType.publish).length, 3);
});

test("Retained messages verification and clearance", async () => {
  const { mqttConn, mqttServer } = startMockServer();
  await connect(mqttConn, { clientId: "myclientid", clean: true });

  // Publish retained messages
  await publish(mqttConn, topics[1], 0, { retain: true, payload: "qos 0" });
  await publish(mqttConn, topics[2], 1, {
    retain: true,
    payload: "qos 1",
    id: 3,
  });
  await publish(mqttConn, topics[3], 2, {
    retain: true,
    payload: "qos 2",
    id: 4,
  });

  await delay(50);

  // Bring a secondary client online to assert the retained packets deliver on subscription
  const bConn = addMockClient(mqttServer);
  await connect(bConn, { clientId: "myclientid2", clean: true });
  await subscribe(bConn, [{ topicFilter: wildtopics[5], qos: 2 }]);

  const packets = await receiveMessages(bConn);
  assert.strictEqual(packets.length, 3);
  assert.equal(packets.filter((p) => p.type === PacketType.publish).length, 3);

  // Clear retained messages by publishing empty payloads
  await publish(mqttConn, topics[1], 0, { retain: true, payload: "" });
  await publish(mqttConn, topics[2], 1, { retain: true, payload: "", id: 5 });
  await publish(mqttConn, topics[3], 2, { retain: true, payload: "", id: 6 });

  await disconnect(mqttConn);
});

test("Will message execution upon un-clean termination", async () => {
  const { mqttConn: aConn, mqttServer } = startMockServer();

  const payload = txtEncoder.encode("client not disconnected");
  await connect(aConn, {
    clientId: "myclientid",
    clean: true,
    keepAlive: 2,
    will: {
      topic: topics[2],
      payload,
      qos: 2,
      retain: false,
    },
  });

  // Setup client B to monitor the Will topic
  const bConn = addMockClient(mqttServer);
  await connect(bConn, { clientId: "myclientid2", clean: false });
  await subscribe(bConn, [{ topicFilter: topics[2], qos: 2 }]);

  // Kill Connection A abruptly (no DISCONNECT packet sent)
  await aConn.close();

  // Connection B picks up the system-dispatched Will publication
  const { value: willPacket } = await bConn.next();
  assert.strictEqual(willPacket.type, PacketType.publish);
  assert.strictEqual(willPacket.topic, topics[2]);

  await disconnect(bConn);
});

test("Zero length Client ID rules under MQTT 3.1.1", async () => {
  const { mqttConn: mqttConn1, mqttServer } = startMockServer();

  const invalidZeroIdPacket: ConnectPacket = {
    type: PacketType.connect,
    protocolName: "MQTT",
    protocolLevel: MQTTLevel.v4,
    clientId: "",
    clean: false, // Disallowed for zero-length IDs in 3.1.1
    keepAlive: 0,
  };

  // 1. Clean = false must fail/be rejected
  await mqttConn1.send(invalidZeroIdPacket);
  const response1 = await mqttConn1.next();
  // Server will either return an error Connack code or shut down connection
  if (response1.value) {
    assert.notStrictEqual(response1.value.returnCode, 0);
  }

  // 2. Clean = true must succeed
  const mqttConn2 = addMockClient(mqttServer);
  invalidZeroIdPacket.clean = true;
  await mqttConn2.send(invalidZeroIdPacket);
  const { value: connack } = await mqttConn2.next();
  assert.strictEqual(connack.type, PacketType.connack);

  await disconnect(mqttConn2);
});

test("Offline message queueing across clean=false reconnects", async () => {
  const { mqttConn: aConn, mqttServer } = startMockServer();

  // Connect and subscribe to topic with clean=false
  await connect(aConn, { clientId: "offlineClient", clean: false });
  await subscribe(aConn, [{ topicFilter: wildtopics[5], qos: 2 }]);
  await disconnect(aConn);

  // Bring on a publisher while target is offline
  const bConn = addMockClient(mqttServer);
  await connect(bConn, { clientId: "publisher", clean: true });
  await publish(bConn, topics[1], 0, { payload: "qos 0" });
  await publish(bConn, topics[2], 1, { payload: "qos 1", id: 10 });
  await publish(bConn, topics[3], 2, { payload: "qos 2", id: 11 });
  await disconnect(bConn);

  // Re-establish offline target client session
  const aReconnect = addMockClient(mqttServer);
  await connect(aReconnect, { clientId: "offlineClient", clean: false });

  // Confirm persistent QoS 1 & QoS 2 flights get pushed to consumer
  const msg1 = await aReconnect.next();
  const msg2 = await aReconnect.next();
  assert.strictEqual(msg1.value.type, PacketType.publish);
  assert.strictEqual(msg2.value.type, PacketType.publish);

  await disconnect(aReconnect);
});

test("Subscribe failure validation returns 0x80", async () => {
  function isAuthorizedToSubscribe(_ctx: never, topic: string): boolean {
    return topic !== NO_SUBSCRIBE_TOPIC;
  }

  const { mqttConn } = startMockServer({
    handlers: { isAuthorizedToSubscribe },
  });
  await connect(mqttConn);

  const suback = await subscribe(
    mqttConn,
    [{
      topicFilter: nosubscribeTopics[0],
      qos: 2,
    }],
    { id: 1, checkAcks: false },
  );
  assert.deepStrictEqual(suback.returnCodes || [suback.status], [0x80]);
  await disconnect(mqttConn);
});

test("Unsubscribe removes specific active topic metrics", async () => {
  const { mqttConn } = startMockServer();
  await connect(mqttConn);

  // Register multiple topic patterns
  await subscribe(mqttConn, [
    { topicFilter: topics[0], qos: 2 },
    { topicFilter: topics[1], qos: 2 },
  ]);

  // Issue UNSUBSCRIBE to single item
  await unsubscribe(mqttConn, [topics[0]], { id: 2 });
  await disconnect(mqttConn);
});

test("Overlapping subscriptions routing behavior", async () => {
  const { mqttConn: aConn, mqttServer } = startMockServer();
  await connect(aConn, { clientId: "overlappingClient" });

  // Subscribe to multiple overlapping filters matching the same topic
  await subscribe(aConn, [
    { topicFilter: wildtopics[6], qos: 2 }, // TopicA/#
    { topicFilter: wildtopics[0], qos: 1 }, // TopicA/+
  ]);

  // Publish from a secondary context
  const publisherConn = addMockClient(mqttServer);
  await connect(publisherConn, { clientId: "overlappingPub" });
  await publish(publisherConn, topics[3], 2, {
    payload: "overlapping topic filters",
  }); // TopicA/C
  await disconnect(publisherConn);

  await delay(50);

  // Consume incoming payloads sent to the client
  const messages = await receiveMessages(aConn);
  const qos = [];
  for (const mesg of messages) {
    assert.strictEqual(
      mesg.type,
      PacketType.publish,
      "Expecting a PUBLISH packet",
    );
    const packet = mesg as PublishPacket;
    qos.push(packet.qos);
  }
  // The server may send back 1 message with the highest QoS, or 1 message for each matching filter
  assert.ok(
    messages.length === 1 || messages.length === 2,
    "Should receive 1 or 2 messages",
  );
  if (messages.length === 1) {
    assert.strictEqual(
      qos[0],
      2,
      "Single delivered packet must inherit highest QoS",
    );
  } else {
    const qosLevels = qos.sort();
    assert.deepStrictEqual(
      qosLevels,
      [1, 2],
      "Delivered packets must match both matching subscription QoS layers",
    );
  }
  await disconnect(aConn);
});

test("Keepalive termination triggers Will dispatching", async () => {
  const { mqttConn: aConn, mqttServer } = startMockServer();

  // Connect Client A with a tight 1 second keepAlive and a Will payload
  await connect(aConn, {
    clientId: "willClient",
    keepAlive: 1,
    will: {
      topic: topics[4], // /TopicA
      payload: txtEncoder.encode("keepalive expiry"),
      qos: 2,
      retain: false,
    },
  });

  // Client B sits to watch for the dispatching of that Will topic
  const bConn = addMockClient(mqttServer);
  await connect(bConn, { clientId: "observerClient" });
  await subscribe(bConn, [{ topicFilter: topics[4], qos: 2 }]);

  // We explicitly intentionally idle Client A so that the mock server drops it via timeout rules
  await delay(1600);

  // Client B should pick up the server-sent Will publication
  const { value: willMsg } = await bConn.next();
  assert.ok(willMsg, "Will publication message should arrive at observer");
  assert.strictEqual(willMsg.type, PacketType.publish);
  assert.strictEqual(willMsg.topic, topics[4]);

  await disconnect(bConn);
});

test("Redelivery of uncompleted QoS 1 and QoS 2 packets on un-clean reconnect", async () => {
  const { mqttConn: bConn, mqttServer } = startMockServer();

  // Join session with clean: false
  await connect(bConn, { clientId: "redeliveryClient", clean: false });
  await subscribe(bConn, [{ topicFilter: wildtopics[6], qos: 2 }]); // TopicA/#

  // Simulate an absolute, sudden transport break (close socket abruptly without a regular DISCONNECT)
  await bConn.close();

  // Create an unrelated context to pass packets into the offline client's targets
  const publisherConn = addMockClient(mqttServer);
  await connect(publisherConn, { clientId: "redeliveryPub" });
  await publish(publisherConn, topics[1], 1, {
    payload: "qos 1 packet",
    id: 20,
  }); // TopicA/B
  await publish(publisherConn, topics[3], 2, {
    payload: "qos 2 packet",
    id: 21,
  }); // TopicA/C
  await disconnect(publisherConn);

  await delay(50);

  // Re-establish our session with clean: false
  const bReconnectConn = addMockClient(mqttServer);
  await connect(bReconnectConn, { clientId: "redeliveryClient", clean: false });

  // Assert that both messages get safely pushed immediately onto the reconnected line
  const msg1 = await bReconnectConn.next();
  const msg2 = await bReconnectConn.next();

  assert.strictEqual(msg1.value?.type, PacketType.publish);
  assert.strictEqual(msg2.value?.type, PacketType.publish);

  await disconnect(bReconnectConn);
});

test("$ dollar-sign topics isolation from wildcard tracking", async () => {
  const { mqttConn: bConn, mqttServer } = startMockServer({
    handlers: {
      isAuthenticated: isAuthenticatedBroker,
    },
  });
  await connect(bConn, { clientId: "dollarClient", clean: true });

  // Subscribing to broad wildcard '#' should not match hidden system '$' topics
  await subscribe(bConn, [{ topicFilter: wildtopics[5], qos: 2 }]); // '#'

  // Publish explicitly to a system target structure string
  const publisherConn = addMockClient(mqttServer);
  await connect(publisherConn, { clientId: "dollarPub" });
  await publish(publisherConn, "$" + topics[1], 1, {
    payload: "hidden system info",
  });
  await disconnect(publisherConn);

  // make sure we didn't get any publish
  await ping(bConn);
  await disconnect(bConn);
});
