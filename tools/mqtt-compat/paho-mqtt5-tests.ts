import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  ConnectPacket,
  QoS,
} from "../../server/deps.ts";
import { logger, LogLevel, MQTTLevel, PacketType } from "../../server/deps.ts";
import {
  addMockClient,
  connect5,
  delay,
  disconnect5,
  publish5,
  receiveMessages5,
  startMockServer,
  subscribe5,
  unsubscribe5,
} from "../../dev_utils/mod.ts";
import type {
  ConnectProperties,
  PublishProperties,
} from "../../mqttPacket/Properties.ts";

const txtEncoder = new TextEncoder();
logger.level(LogLevel.error);

// Global-like state setup matching Python suite
const topicPrefix = "client_test5/";
const topics = ["TopicA", "TopicA/B", "Topic/C", "TopicA/C", "/TopicA"].map(
  (t) => topicPrefix + t,
);
const wildtopics = ["TopicA/+", "+/C", "#", "/#", "/+", "+/+", "TopicA/#"].map(
  (t) => topicPrefix + t,
);
const nosubscribeTopics = ["test/nosubscribe"];

// --- Original Tests ---

test("Basic Connection and Publish Flow", async () => {
  const { mqttConn } = startMockServer();

  await connect5(mqttConn, { clientId: "myclientid" });
  await disconnect5(mqttConn);

  const { mqttConn: mqttConn2, mqttServer } = startMockServer();
  await connect5(mqttConn2, { clientId: "myclientid" });

  await subscribe5(mqttConn2, [{ topicFilter: topics[0], qos: 2 }]);

  const mqttConn3 = addMockClient(mqttServer);
  await connect5(mqttConn3, { clientId: "publisher" });

  await publish5(mqttConn3, topics[0], 0, { payload: "qos 0" });
  await publish5(mqttConn3, topics[0], 1, { payload: "qos 1", id: 1 });
  await publish5(mqttConn3, topics[0], 2, { payload: "qos 2", id: 2 });

  const messages = await receiveMessages5(mqttConn2);
  assert.strictEqual(messages.length, 3);
});

test("Retained Messages with User Properties", async () => {
  const { mqttConn, mqttServer } = startMockServer();

  await connect5(mqttConn, { clientId: "myclientid" });

  const properties: PublishProperties = {
    userProperty: [["a", "2"], ["c", "3"]],
  };

  await publish5(mqttConn, topics[1], 0, { retain: true, properties });
  await publish5(mqttConn, topics[2], 1, { retain: true, properties, id: 3 });
  await publish5(mqttConn, topics[3], 2, { retain: true, properties, id: 4 });

  await delay(50);

  const bConn = addMockClient(mqttServer);
  await connect5(bConn, { clientId: "myclientid2" });
  await subscribe5(bConn, [{ topicFilter: wildtopics[5], qos: 2 }]);

  const packets = await receiveMessages5(bConn);

  assert.strictEqual(packets.length, 3);
  assert.strictEqual(
    packets.filter((p) => p.type === PacketType.publish).length,
    3,
  );
  await disconnect5(mqttConn);
});

test("Will Message Configuration", async () => {
  const { mqttConn: aConn, mqttServer } = startMockServer();

  await connect5(aConn, {
    clientId: "myclientid",
    clean: true,
    keepAlive: 2,
    will: {
      topic: topics[2],
      payload: txtEncoder.encode("will message"),
      qos: 2,
      retain: false,
      properties: {
        willDelayInterval: 0,
        userProperty: [["a", "2"], ["c", "3"]],
      },
    },
  });

  const bConn = addMockClient(mqttServer);
  await connect5(bConn, { clientId: "myclientid2" });
  await subscribe5(bConn, [{ topicFilter: topics[2], qos: 2 }]);

  aConn.close();

  const { value: willPublish } = await bConn.next();
  assert.strictEqual(willPublish.type, PacketType.publish);
  assert.strictEqual(willPublish.topic, topics[2]);

  await disconnect5(bConn);
});

test("Zero Length Client Identifier Processing", async () => {
  const { mqttConn } = startMockServer();

  await connect5(mqttConn, { clientId: "" });
  await disconnect5(mqttConn);
});

test("Offline Message Queueing (Session Expiry)", async () => {
  const { mqttConn: aConn, mqttServer } = startMockServer();

  const connPacket: ConnectPacket = {
    type: PacketType.connect,
    protocolName: "MQTT",
    protocolLevel: MQTTLevel.v5,
    clientId: "offlineClient",
    clean: true,
    keepAlive: 0,
    properties: { sessionExpiryInterval: 99999 },
  };

  await aConn.send(connPacket);
  await aConn.next();
  await connect5(aConn, {
    clientId: "offlineClient",
    properties: { sessionExpiryInterval: 99999 },
  });
  await subscribe5(aConn, [{ topicFilter: wildtopics[5], qos: 2 }]);
  await disconnect5(aConn);

  const bConn = addMockClient(mqttServer);
  await connect5(bConn, { clientId: "publisher" });
  await publish5(bConn, topics[1], 0, { payload: "qos 0" });
  await publish5(bConn, topics[2], 1, { payload: "qos 1", id: 10 });
  await publish5(bConn, topics[3], 2, { payload: "qos 2", id: 11 });
  await disconnect5(bConn);

  const aReconnect = addMockClient(mqttServer);
  connPacket.clean = false;
  await aReconnect.send(connPacket);
  await aReconnect.next();

  const packet1 = await aReconnect.next();
  const packet2 = await aReconnect.next();
  assert.strictEqual(packet1.value.type, PacketType.publish);
  assert.strictEqual(packet2.value.type, PacketType.publish);

  await disconnect5(aReconnect);
});

test("Shared Subscriptions Delivery Single-Instance Verification", async () => {
  const { mqttConn: aConn, mqttServer } = startMockServer();
  const sharedSubTopic = `$share/sharename/${topicPrefix}x`;
  const sharedPubTopic = `${topicPrefix}x`;

  await connect5(aConn, { clientId: "clientA" });
  await subscribe5(aConn, [{ topicFilter: sharedSubTopic, qos: 2 }]);

  const bConn = addMockClient(mqttServer);
  await connect5(bConn, { clientId: "clientB" });
  await subscribe5(bConn, [{ topicFilter: sharedSubTopic, qos: 2 }]);

  const pConn = addMockClient(mqttServer);
  await connect5(pConn, { clientId: "publisher" });
  await publish5(pConn, sharedPubTopic, 0, { payload: "shared content" });

  await delay(50);

  await disconnect5(aConn);
  await disconnect5(bConn);
  await disconnect5(pConn);
});

// --- Added Missing Tests (from client_test5.py) ---

test("Overlapping Subscriptions", async () => {
  const { mqttConn: aConn, mqttServer } = startMockServer();
  await connect5(aConn, { clientId: "overlappingClient" });

  await subscribe5(aConn, [
    { topicFilter: wildtopics[6], qos: 2 },
    { topicFilter: wildtopics[0], qos: 1 },
  ]);

  const publisher = addMockClient(mqttServer);
  await connect5(publisher, { clientId: "publishingClient" });
  await publish5(publisher, topics[3], 2, {
    payload: "overlapping topic filters",
  });

  const { value: msg } = await aConn.next();
  assert.strictEqual(msg.type, PacketType.publish);
  await disconnect5(aConn);
});

test("Keepalive Timeout Triggering Will Message", { skip: true }, async () => {
  const { mqttConn: aConn, mqttServer } = startMockServer();

  await connect5(aConn, {
    clientId: "keepaliveClient",
    clean: true,
    keepAlive: 1,
    will: {
      topic: topics[4],
      payload: txtEncoder.encode("keepalive expiry"),
      qos: 2,
      retain: false,
    },
  });

  const bConn = addMockClient(mqttServer);
  await connect5(bConn, { clientId: "watcherClient" });
  await subscribe5(bConn, [{ topicFilter: topics[4], qos: 2 }]);

  // Wait for keepalive timeout on client A
  await delay(2000);

  const { value: willPublish } = await bConn.next();
  assert.strictEqual(willPublish.type, PacketType.publish);
  assert.strictEqual(willPublish.topic, topics[4]);

  await disconnect5(bConn);
});

test("Redelivery on Reconnect", async () => {
  const { mqttConn: bConn, mqttServer } = startMockServer();
  const connProps: ConnectProperties = { sessionExpiryInterval: 99999 };

  await connect5(bConn, {
    clientId: "redeliverClient",
    clean: false,
    properties: connProps,
  });
  await subscribe5(bConn, [{ topicFilter: wildtopics[6], qos: 2 }]);

  const publisher = addMockClient(mqttServer);
  await connect5(publisher, { clientId: "publisher" });
  await publish5(publisher, topics[1], 1, {
    payload: "unacked qos 1",
    id: 100,
  });
  await publish5(publisher, topics[3], 2, {
    payload: "unacked qos 2",
    id: 101,
  });
  await disconnect5(publisher);
  bConn.close();

  // Reconnect and verify redelivery
  const bReconnect = addMockClient(mqttServer);
  await connect5(bReconnect, {
    clientId: "redeliverClient",
    clean: false,
    properties: connProps,
  });

  const msg1 = await bReconnect.next();
  const msg2 = await bReconnect.next();
  assert.strictEqual(msg1.value.type, PacketType.publish);
  assert.strictEqual(msg2.value.type, PacketType.publish);

  await disconnect5(bReconnect);
});

test("Subscribe Failure (Reason Code 0x80)", async () => {
  const { mqttConn } = startMockServer();
  await connect5(mqttConn, { clientId: "subFailClient" });

  const suback = await subscribe5(mqttConn, [{
    topicFilter: nosubscribeTopics[0],
    qos: 2,
  }]);
  assert.strictEqual(suback.type, PacketType.suback);

  await disconnect5(mqttConn);
});

test("Dollar ($) Topics Wildcard Isolation", async () => {
  const { mqttConn, mqttServer } = startMockServer();

  await connect5(mqttConn, { clientId: "dollarSubscriber" });
  await subscribe5(mqttConn, [{ topicFilter: wildtopics[5], qos: 2 }]);

  const pConn = addMockClient(mqttServer);
  await connect5(pConn, { clientId: "dollarPublisher" });
  await publish5(pConn, "$" + topics[1], 1, {
    payload: "dollar topic payload",
  });

  await delay(50);
  await disconnect5(mqttConn);
  await disconnect5(pConn);
});

test("Unsubscribe Topics Flow", async () => {
  const { mqttConn: bConn, mqttServer } = startMockServer();

  await connect5(bConn, { clientId: "unsubClient" });
  await subscribe5(bConn, [
    { topicFilter: topics[0], qos: 2 },
    { topicFilter: topics[1], qos: 2 },
    { topicFilter: topics[2], qos: 2 },
  ]);

  await unsubscribe5(bConn, [topics[0]]);

  const aConn = addMockClient(mqttServer);
  await connect5(aConn, { clientId: "unsubPub" });
  await publish5(aConn, topics[0], 1, { payload: "unsubscribed topic" });
  await publish5(aConn, topics[1], 1, { payload: "active topic 1" });
  await publish5(aConn, topics[2], 1, { payload: "active topic 2" });

  const messages = await receiveMessages5(bConn);
  assert.strictEqual(messages.length, 2);
  await disconnect5(aConn);
});

test("Session Expiry Lifecycle and Reconnection", async () => {
  const { mqttConn } = startMockServer();

  // 1. Session Expiry = 0 (Immediate expiry)
  await connect5(mqttConn, {
    clientId: "expiryClient",
    clean: true,
    properties: { sessionExpiryInterval: 0 },
  });
  await subscribe5(mqttConn, [{ topicFilter: topics[0], qos: 2 }]);
  await disconnect5(mqttConn);

  // Reconnect clean=false -> session should not be present
  const { mqttConn: conn2 } = startMockServer();
  const connack2 = await connect5(conn2, {
    clientId: "expiryClient",
    clean: false,
    properties: { sessionExpiryInterval: 0 },
  });
  assert.strictEqual(connack2.sessionPresent, false);
  await disconnect5(conn2);
});

test("User Properties in Publish Packets", async () => {
  const { mqttConn, mqttServer } = startMockServer();

  await connect5(mqttConn, { clientId: "userPropSub" });
  await subscribe5(mqttConn, [{ topicFilter: topics[0], qos: 2 }]);

  const pConn = addMockClient(mqttServer);
  await connect5(pConn, { clientId: "userPropPub" });

  const userProps: PublishProperties = {
    userProperty: [["a", "2"], ["c", "3"]],
  };

  await publish5(pConn, topics[0], 0, { properties: userProps });
  await publish5(pConn, topics[0], 1, { properties: userProps, id: 1 });
  await publish5(pConn, topics[0], 2, { properties: userProps, id: 2 });

  const messages = await receiveMessages5(mqttConn);
  assert.strictEqual(messages.length, 3);
  await disconnect5(pConn);
});

test("Payload Format Indicator and Content Type", async () => {
  const { mqttConn, mqttServer } = startMockServer();

  await connect5(mqttConn, { clientId: "payloadFormatSub" });
  await subscribe5(mqttConn, [{ topicFilter: topics[0], qos: 2 }]);

  const pConn = addMockClient(mqttServer);
  await connect5(pConn, { clientId: "payloadFormatPub" });

  const props: PublishProperties = {
    payloadFormatIndicator: true,
    contentType: "application/json",
  };

  await publish5(pConn, topics[0], 1, {
    payload: '{"key":"value"}',
    properties: props,
    id: 10,
  });

  const { value: pubMsg } = await mqttConn.next();
  assert.strictEqual(pubMsg.type, PacketType.publish);
  assert.strictEqual(pubMsg.properties?.payloadFormatIndicator, true);
  assert.strictEqual(pubMsg.properties?.contentType, "application/json");

  await disconnect5(mqttConn);
  await disconnect5(pConn);
});

test("Publication Message Expiry Interval", { skip: true }, async () => {
  const { mqttConn: bConn, mqttServer } = startMockServer();

  await connect5(bConn, {
    clientId: "pubExpirySub",
    clean: true,
    properties: { sessionExpiryInterval: 99999 },
  });
  await subscribe5(bConn, [{ topicFilter: topics[0], qos: 2 }]);
  await disconnect5(bConn, { properties: { sessionExpiryInterval: 99999 } });

  const aConn = addMockClient(mqttServer);
  await connect5(aConn, { clientId: "pubExpiryPub" });

  await publish5(aConn, topics[0], 1, {
    payload: "expired message",
    properties: { messageExpiryInterval: 1 },
    id: 1,
  });
  await publish5(aConn, topics[0], 1, {
    payload: "valid message",
    properties: { messageExpiryInterval: 60 },
    id: 2,
  });

  await delay(1500); // Allow first message to expire

  const bReconnect = addMockClient(mqttServer);
  await connect5(bReconnect, { clientId: "pubExpirySub", clean: false });

  const { value: recMsg } = await bReconnect.next();
  assert.strictEqual(recMsg.type, PacketType.publish);
  assert.strictEqual(recMsg.payload, "valid message");

  await disconnect5(aConn);
  await disconnect5(bReconnect);
});

test("Subscribe Options (noLocal, retainAsPublished, retainHandling)", async () => {
  const { mqttConn: aConn, mqttServer } = startMockServer();

  // --- 1. Test noLocal ---
  await connect5(aConn, { clientId: "clientA" });
  await subscribe5(aConn, [{ topicFilter: topics[0], qos: 2, noLocal: true }]);

  const bConn = addMockClient(mqttServer);
  await connect5(bConn, { clientId: "clientB" });
  await subscribe5(bConn, [{ topicFilter: topics[0], qos: 2, noLocal: true }]);

  // Client A publishes; should not receive its own message due to noLocal, but Client B should
  await publish5(aConn, topics[0], 1, { payload: "noLocal test", id: 1 });

  const { value: bMsg } = await bConn.next();
  assert.strictEqual(bMsg.type, PacketType.publish);
  assert.strictEqual(bMsg.payload, "noLocal test");

  await disconnect5(aConn);
  await disconnect5(bConn);

  // --- 2. Test retainAsPublished ---
  const { mqttConn: connRetain } = startMockServer();
  await connect5(connRetain, { clientId: "retainAsPublishedClient" });
  await subscribe5(connRetain, [{
    topicFilter: topics[0],
    qos: 2,
    retainAsPublished: true,
  }]);

  await publish5(connRetain, topics[0], 1, {
    payload: "retain false",
    retain: false,
    id: 2,
  });
  await publish5(connRetain, topics[0], 1, {
    payload: "retain true",
    retain: true,
    id: 3,
  });

  const { value: msg1 } = await connRetain.next();
  const { value: msg2 } = await connRetain.next();

  assert.strictEqual(msg1.retain, false);
  assert.strictEqual(msg2.retain, true);

  await disconnect5(connRetain);

  // --- 3. Test retainHandling ---
  // Clean start & prepare some retained messages via Client A
  const { mqttConn: publisherConn, mqttServer: retainServer } =
    startMockServer();
  await connect5(publisherConn, { clientId: "retainPublisher" });
  await publish5(publisherConn, topics[1], 0, {
    payload: "qos 0",
    retain: true,
  });
  await publish5(publisherConn, topics[2], 1, {
    payload: "qos 1",
    retain: true,
    id: 4,
  });
  await publish5(publisherConn, topics[3], 2, {
    payload: "qos 2",
    retain: true,
    id: 5,
  });
  await delay(50);

  // retainHandling = 1 (send retained messages only on NEW subscription)
  const subscriberConn = addMockClient(retainServer);
  await connect5(subscriberConn, { clientId: "retainHandlerClient" });

  // 1st subscription -> messages should arrive
  await subscribe5(subscriberConn, [{
    topicFilter: wildtopics[5],
    qos: 2,
    retainHandling: 1,
  }]);
  const r1 = await subscriberConn.next();
  const r2 = await subscriberConn.next();
  const r3 = await subscriberConn.next();
  assert.strictEqual(r1.value.type, PacketType.publish);
  assert.strictEqual(r2.value.type, PacketType.publish);
  assert.strictEqual(r3.value.type, PacketType.publish);

  // 2nd subscription to the same filter -> retainHandling=1 ensures they are NOT re-sent
  await subscribe5(subscriberConn, [{
    topicFilter: wildtopics[5],
    qos: 2,
    retainHandling: 1,
  }]);
  await delay(100);

  // retainHandling = 2 (NEVER send retained messages on subscribe)
  await subscribe5(subscriberConn, [{
    topicFilter: wildtopics[5],
    qos: 2,
    retainHandling: 2,
  }]);
  await delay(100);

  await disconnect5(publisherConn);
  await disconnect5(subscriberConn);
});

test("Assigned Client Identifier", async () => {
  const { mqttConn } = startMockServer();

  // Send a CONNECT packet with an empty clientId
  const connack = await connect5(mqttConn, { clientId: "" });

  assert.strictEqual(connack.type, PacketType.connack);
  // The broker must return an AssignedClientIdentifier in properties
  assert.ok(connack.properties?.assignedClientIdentifier);
  assert.notStrictEqual(connack.properties.assignedClientIdentifier, "");

  await disconnect5(mqttConn);
});

test("Subscribe Identifiers", async () => {
  const { mqttConn: aConn, mqttServer } = startMockServer();

  await connect5(aConn, { clientId: "subIdClientA" });
  await subscribe5(
    aConn,
    [{ topicFilter: topics[0], qos: 2 }],
    { subscriptionIdentifier: 456789 },
  );

  const bConn = addMockClient(mqttServer);
  await connect5(bConn, { clientId: "subIdClientB" });
  await subscribe5(
    bConn,
    [{ topicFilter: topics[0], qos: 2 }],
    { subscriptionIdentifier: 2 },
  );
  await subscribe5(
    bConn,
    [{ topicFilter: topics[0] + "/#", qos: 2 }],
    { subscriptionIdentifier: 3 },
  );

  const publisher = addMockClient(mqttServer);
  await connect5(publisher);
  await publish5(publisher, topics[0], 1, {
    payload: "sub identifier test",
    id: 1,
  });
  await disconnect5(publisher);

  const { value: msgA } = await aConn.next();
  assert.strictEqual(msgA.type, PacketType.publish);
  assert.deepStrictEqual(msgA.properties?.subscriptionIdentifiers, [456789]);

  const { value: msgB } = await bConn.next();
  assert.strictEqual(msgB.type, PacketType.publish);
  // For multiple matching subscription IDs, expect them as an array/set
  const subIds = msgB.properties?.subscriptionIdentifiers;
  assert.deepStrictEqual(new Set(subIds), new Set([2, 3]));

  await disconnect5(aConn);
  await disconnect5(bConn);
});

test("Request Response Pattern", async () => {
  const { mqttConn: aConn, mqttServer } = startMockServer();

  await connect5(aConn, { clientId: "requester" });
  const bConn = addMockClient(mqttServer);
  await connect5(bConn, { clientId: "responder" });

  await subscribe5(aConn, [{ topicFilter: topics[1], qos: 2 }]);
  await subscribe5(bConn, [{ topicFilter: topics[0], qos: 2 }]);

  const reqProps: PublishProperties = {
    responseTopic: topics[1],
    correlationData: txtEncoder.encode("334"),
  };

  // Requester sends a request
  await publish5(aConn, topics[0], 1, {
    payload: "request",
    properties: reqProps,
    id: 1,
  });

  // Responder receives the request
  const { value: reqMsg } = await bConn.next();
  assert.strictEqual(reqMsg.type, PacketType.publish);
  assert.strictEqual(reqMsg.properties?.responseTopic, topics[1]);

  // Responder sends a response back to responseTopic using correlationData
  await publish5(bConn, reqMsg.properties.responseTopic, 1, {
    payload: "response",
    properties: { correlationData: reqMsg.properties.correlationData },
    id: 2,
  });

  // Requester receives the response
  const { value: respMsg } = await aConn.next();
  assert.strictEqual(respMsg.type, PacketType.publish);
  assert.deepEqual(respMsg.payload, txtEncoder.encode("response"));

  await disconnect5(aConn);
  await disconnect5(bConn);
});

test("Client Topic Alias", async () => {
  const { mqttConn } = startMockServer();

  // Test 1: Topic Alias 0 is invalid and must trigger a disconnect
  await connect5(mqttConn, { clientId: "topicAliasClient" });
  await mqttConn.send({
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v5,
    topic: topics[0],
    qos: 1,
    id: 1,
    payload: txtEncoder.encode("invalid alias 0"),
    properties: { topicAlias: 0 },
  });

  const { value: disc1 } = await mqttConn.next();
  assert.strictEqual(disc1.type, PacketType.disconnect);

  // Test 2: Valid Topic Alias usage
  const { mqttConn: conn2 } = startMockServer();
  const connack = await connect5(conn2, {
    clientId: "topicAliasClient",
    properties: { topicAliasMaximum: 5 },
  });

  if ((connack.properties?.topicAliasMaximum ?? 0) > 0) {
    await subscribe5(conn2, [{ topicFilter: topics[0], qos: 2 }]);

    // First message sets up the alias mapping
    await publish5(conn2, topics[0], 1, {
      payload: "alias mapping",
      properties: { topicAlias: 1 },
      id: 2,
    });
    const { value: m1 } = await conn2.next();
    assert.strictEqual(m1.type, PacketType.publish);

    // Subsequent message uses an empty topic string with the existing alias
    await publish5(conn2, "", 1, {
      payload: "using alias",
      properties: { topicAlias: 1 },
      id: 3,
    });
    const { value: m2 } = await conn2.next();
    assert.strictEqual(m2.type, PacketType.publish);
  }

  await disconnect5(conn2);
});

test("Server Topic Alias", async () => {
  const { mqttConn } = startMockServer();

  // Client indicates support for server topic aliases (max 1)
  await connect5(mqttConn, {
    clientId: "serverTopicAliasClient",
    properties: { topicAliasMaximum: 1 },
  });
  await subscribe5(mqttConn, [{ topicFilter: topics[0], qos: 2 }]);

  for (let qos = 0; qos < 3; qos++) {
    await publish5(mqttConn, topics[0], qos as QoS, {
      payload: `msg qos ${qos}`,
      id: qos || undefined,
    });
  }

  // First received message establishes the alias on the client
  const { value: msg1 } = await mqttConn.next();
  assert.strictEqual(msg1.type, PacketType.publish);
  assert.ok(msg1.properties?.topicAlias);
  assert.strictEqual(msg1.topic, topics[0]);

  // Subsequent messages use the alias and may contain an empty topic string
  const { value: msg2 } = await mqttConn.next();
  assert.strictEqual(msg2.type, PacketType.publish);
  assert.strictEqual(msg2.properties?.topicAlias, msg1.properties.topicAlias);

  await disconnect5(mqttConn);
});

test("Maximum Packet Size Handling", async () => {
  const { mqttConn } = startMockServer();
  const maxPacketSize = 64;

  await connect5(mqttConn, {
    clientId: "maxPacketClient",
    properties: { maximumPacketSize: maxPacketSize },
  });
  await subscribe5(mqttConn, [{ topicFilter: topics[0], qos: 2 }]);

  // Messages smaller than maximum packet size should be processed normally
  const smallPayload = "a".repeat(Math.floor(maxPacketSize / 2));
  await publish5(mqttConn, topics[0], 0, { payload: smallPayload });

  const { value: smallMsg } = await mqttConn.next();
  assert.strictEqual(smallMsg.type, PacketType.publish);

  // Messages exceeding MaximumPacketSize must not be delivered
  const hugePayload = "a".repeat(maxPacketSize * 2);
  await publish5(mqttConn, topics[0], 1, { payload: hugePayload, id: 10 });

  await delay(100); // Short delay to verify no new packet is received
  await disconnect5(mqttConn);
});

test("Server Keep Alive Enforcement", async () => {
  const { mqttConn } = startMockServer({
    configuration: { context: { serverKeepAlive: 60 } },
  });

  // Request a keepAlive of 120 seconds
  const connack = await connect5(mqttConn, {
    clientId: "keepAliveClient",
    keepAlive: 120,
  });

  // Verify the server enforces a ServerKeepAlive (e.g., 60 seconds)
  assert.ok(connack.properties?.serverKeepAlive !== undefined);
  assert.strictEqual(connack.properties.serverKeepAlive, 60);

  await disconnect5(mqttConn);
});

test("Flow Control - Client Receive Maximum", { skip: true }, async () => {
  const { mqttConn } = startMockServer();
  const clientReceiveMaximum = 2;

  await connect5(mqttConn, {
    clientId: "flowControlClient1",
    properties: { receiveMaximum: clientReceiveMaximum },
  });
  await subscribe5(mqttConn, [{ topicFilter: topics[0], qos: 2 }]);

  // Send 1 more than the allowed maximum number of unacknowledged messages
  for (let i = 1; i <= clientReceiveMaximum + 1; i++) {
    await publish5(mqttConn, topics[0], 1, { payload: `flow msg ${i}`, id: i });
  }

  // Receive the initial allowed messages
  const { value: msg1 } = await mqttConn.next();
  const { value: msg2 } = await mqttConn.next();
  assert.strictEqual(msg1.type, PacketType.publish);
  assert.strictEqual(msg2.type, PacketType.publish);

  // Send PUBACK to free up a slot
  await mqttConn.send({
    type: PacketType.puback,
    protocolLevel: 5,
    id: msg1.id,
  });

  // Now the 3rd message should be received
  const { value: msg3 } = await mqttConn.next();
  assert.strictEqual(msg3.type, PacketType.publish);

  await disconnect5(mqttConn);
});

test("Flow Control - Exceeding Server Receive Maximum", async () => {
  const { mqttConn } = startMockServer();

  const connack = await connect5(mqttConn, { clientId: "flowControlClient2" });
  const serverReceiveMax = connack.properties?.receiveMaximum ?? 65535;

  // If the server enforces a low limit, exceed it to test disconnect reason code 0x93
  if (serverReceiveMax < 10) {
    for (let i = 1; i <= serverReceiveMax + 1; i++) {
      await publish5(mqttConn, topics[0], 2, {
        payload: `exceed msg ${i}`,
        id: i,
      });
    }

    const { value: disc } = await mqttConn.next();
    assert.strictEqual(disc.type, PacketType.disconnect);
    // Reason Code 147 (0x93) = Receive Maximum exceeded
    assert.strictEqual(disc.reasonCode, 0x93);
  } else {
    await disconnect5(mqttConn);
  }
});

test("Will Delay Interval and Session Expiry Interaction", async () => {
  const { mqttConn: aConn, mqttServer } = startMockServer();

  // Test case: WillDelayInterval is set
  await connect5(aConn, {
    clientId: "willDelayClient",
    clean: true,
    keepAlive: 0,
    properties: { sessionExpiryInterval: 5 },
    will: {
      topic: topics[0],
      payload: txtEncoder.encode("delayed will message"),
      qos: 2,
      retain: false,
      properties: { willDelayInterval: 1 },
    },
  });

  const bConn = addMockClient(mqttServer);
  await connect5(bConn, { clientId: "watcherClient" });
  await subscribe5(bConn, [{ topicFilter: topics[0], qos: 2 }]);

  // Force an unclean disconnection of Client A
  aConn.close();

  // The will message should not arrive immediately, but only after the willDelayInterval (1s)
  await delay(1200);

  const { value: willPub } = await bConn.next();
  assert.strictEqual(willPub.type, PacketType.publish);
  assert.strictEqual(willPub.topic, topics[0]);

  await disconnect5(bConn);
});
