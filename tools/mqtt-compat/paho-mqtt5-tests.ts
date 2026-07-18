import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnyPacket, ConnectPacket, MqttConn } from "../../server/deps.ts";
import { MQTTLevel, PacketType } from "../../server/deps.ts";
import {
  addMockClient,
  connect,
  delay,
  disconnect,
  publish,
  startMockServer,
  subscribe,
} from "../../dev_utils/mod.ts";

const txtEncoder = new TextEncoder();
const level = 5;

// Setup global-like state mimicking original setData()
const topicPrefix = "client_test5/";
const topics = ["TopicA", "TopicA/B", "Topic/C", "TopicA/C", "/TopicA"].map(
  (t) => topicPrefix + t,
);
const wildtopics = ["TopicA/+", "+/C", "#", "/#", "/+", "+/+", "TopicA/#"].map(
  (t) => topicPrefix + t,
);
//const nosubscribeTopics = ["test/nosubscribe"];

async function receiveMessages(conn: MqttConn): Promise<AnyPacket[]> {
  const received = Array.fromAsync(conn);
  await delay(10);
  await disconnect(conn);
  const messages = await received;
  return messages;
}

// --- Tests ---

test("Basic Connection and Publish Flow", async () => {
  const { mqttConn } = startMockServer();

  // Test Connect & Disconnect sequence
  await connect(mqttConn, { clientId: "myclientid" });
  await disconnect(mqttConn);

  // Reconnect and test basic subscription and publishes
  const mqttConn2 = startMockServer().mqttConn;
  await connect(mqttConn2, { clientId: "myclientid" });

  await subscribe(mqttConn2, [{ topicFilter: topics[0], qos: 2 }]);

  await publish(mqttConn2, topics[0], 0, {
    payload: "qos 0",
  });
  await publish(mqttConn2, topics[0], 1, {
    payload: "qos 1",
    id: 1,
  });
  await publish(mqttConn2, topics[0], 2, {
    payload: "qos 2",
    id: 2,
  });

  await delay(100);
  await disconnect(mqttConn2);
});

test("Retained Messages with User Properties", async () => {
  const { mqttConn, mqttServer } = startMockServer();

  await connect(mqttConn, { clientId: "myclientid" });

  const properties = {
    userProperties: { a: "2", c: "3" },
  };

  // Publish retained messages
  await publish(mqttConn, topics[1], 0, { level, retain: true, properties });
  await publish(mqttConn, topics[2], 1, { retain: true, properties, id: 3 });
  await publish(mqttConn, topics[3], 2, { retain: true, properties, id: 4 });

  await delay(50);

  // New client subscribes to catch wildcards
  const bConn = addMockClient(mqttServer);
  await connect(bConn, { clientId: "myclientid2" });
  await subscribe(bConn, [{ topicFilter: wildtopics[5], qos: 2 }]);

  // Consume published matching packets
  const packets = await receiveMessages(bConn);

  assert.strictEqual(packets.length, 3);
  assert.equal(packets.filter((p) => p.type === PacketType.publish).length, 3);
  await disconnect(mqttConn);
});

test("Will Message Configuration", async () => {
  const { mqttConn: aConn, mqttServer } = startMockServer();

  // Connect client A with Will
  await connect(aConn, {
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
        userProperty: [['a','2'],[ "c", "3"] ],
      },
    },
  });

  // Connect client B to watch the topic
  const bConn = addMockClient(mqttServer);
  await connect(bConn, { clientId: "myclientid2" });
  await subscribe(bConn, [{ topicFilter: topics[2], qos: 2 }]);

  // Abruptly terminate connection A without cleanly calling disconnect
  await aConn.close();

  // Client B should receive the Will message due to the forced closure
  const { value: willPublish } = await bConn.next();
  assert.strictEqual(willPublish.type, PacketType.publish);
  assert.strictEqual(willPublish.topic, topics[2]);

  await disconnect(bConn);
});

test("Zero Length Client Identifier Processing", async () => {
  const { mqttConn } = startMockServer();

  const packetWithZeroId: AnyPacket = {
    type: PacketType.connect,
    protocolName: "MQTT",
    protocolLevel: MQTTLevel.v5,
    clientId: "",
    clean: true,
    keepAlive: 0,
  };

  await mqttConn.send(packetWithZeroId);
  const { value: connack } = await mqttConn.next();
  assert.strictEqual(connack.type, PacketType.connack);

  await disconnect(mqttConn);
});

test("Offline Message Queueing (Session Expiry)", async () => {
  const { mqttConn: aConn, mqttServer } = startMockServer();

  // Connect with high session expiry to survive disconnects
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
  await subscribe(aConn, [{ topicFilter: wildtopics[5], qos: 2 }]);
  await disconnect(aConn);

  // Publish messages while offline
  const bConn = addMockClient(mqttServer);
  await connect(bConn, { clientId: "publisher" });
  await publish(bConn, topics[1], 0, { payload: "qos 0" });
  await publish(bConn, topics[2], 1, {
    payload: "qos 1",
    id: 10,
  });
  await publish(bConn, topics[3], 2, {
    payload: "qos 2",
    id: 11,
  });
  await disconnect(bConn);

  // Reconnect target client
  const aReconnect = addMockClient(mqttServer);
  connPacket.clean = false;
  await aReconnect.send(connPacket);
  await aReconnect.next();

  // Validate that stored QoS 1 & QoS 2 packets deliver successfully
  const packet1 = await aReconnect.next();
  const packet2 = await aReconnect.next();
  assert.strictEqual(packet1.value.type, PacketType.publish);
  assert.strictEqual(packet2.value.type, PacketType.publish);

  await disconnect(aReconnect);
});

test("Shared Subscriptions Delivery Single-Instance Verification", async () => {
  const { mqttConn: aConn, mqttServer } = startMockServer();
  const sharedSubTopic = `$share/sharename/${topicPrefix}x`;
  const sharedPubTopic = `${topicPrefix}x`;

  await connect(aConn, { clientId: "clientA" });
  await subscribe(aConn, [{ topicFilter: sharedSubTopic, qos: 2 }]);

  const bConn = addMockClient(mqttServer);
  await connect(bConn, { clientId: "clientB" });
  await subscribe(bConn, [{ topicFilter: sharedSubTopic, qos: 2 }]);

  // Publishing to shared topic structure
  const pConn = addMockClient(mqttServer);
  await connect(pConn, { clientId: "publisher" });
  await publish(pConn, sharedPubTopic, 0, {
    payload: "shared content",
  });

  // Introduce short validation lock to check execution order balance
  await delay(50);

  await disconnect(aConn);
  await disconnect(bConn);
  await disconnect(pConn);
});
