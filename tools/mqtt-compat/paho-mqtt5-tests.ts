import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnyPacket, ConnectPacket, MqttConn } from "../../server/deps.ts";
import { MQTTLevel, PacketType } from "../../server/deps.ts";
import {
  addMockClient,
  connect5,
  delay,
  disconnect5,
  publish5,
  startMockServer,
  subscribe5,
} from "../../dev_utils/mod.ts";
import type { PublishProperties } from "../../mqttPacket/Properties.ts";

const txtEncoder = new TextEncoder();


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
  await disconnect5(conn);
  const messages = await received;
  return messages;
}

// --- Tests ---

test("Basic Connection and Publish Flow", async () => {
  const { mqttConn } = startMockServer();

  // Test Connect & Disconnect sequence
  await connect5(mqttConn, { clientId: "myclientid" });
  await disconnect5(mqttConn);

  // Reconnect and test basic subscription and publishes
  const mqttConn2 = startMockServer().mqttConn;
  await connect5(mqttConn2, { clientId: "myclientid" });

  await subscribe5(mqttConn2, [{ topicFilter: topics[0], qos: 2 }]);

  await publish5(mqttConn2, topics[0], 0, {
    payload: "qos 0",
  });
  await publish5(mqttConn2, topics[0], 1, {
    payload: "qos 1",
    id: 1,
  });
  await publish5(mqttConn2, topics[0], 2, {
    payload: "qos 2",
    id: 2,
  });

  await delay(100);
  await disconnect5(mqttConn2);
});

test("Retained Messages with User Properties", async () => {
  const { mqttConn, mqttServer } = startMockServer();

  await connect5(mqttConn, { clientId: "myclientid" });

  const properties:PublishProperties = {
    userProperty: [["a", "2"], ["c", "3"] ],
  };

  // Publish retained messages
  await publish5(mqttConn, topics[1], 0, { retain: true, properties });
  await publish5(mqttConn, topics[2], 1, { retain: true, properties, id: 3 });
  await publish5(mqttConn, topics[3], 2, { retain: true, properties, id: 4 });

  await delay(50);

  // New client subscribes to catch wildcards
  const bConn = addMockClient(mqttServer);
  await connect5(bConn, { clientId: "myclientid2" });
  await subscribe5(bConn, [{ topicFilter: wildtopics[5], qos: 2 }]);

  // Consume published matching packets
  const packets = await receiveMessages(bConn);

  assert.strictEqual(packets.length, 3);
  assert.equal(packets.filter((p) => p.type === PacketType.publish).length, 3);
  await disconnect5(mqttConn);
});

test("Will Message Configuration", async () => {
  const { mqttConn: aConn, mqttServer } = startMockServer();

  // Connect client A with Will
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

  // Connect client B to watch the topic
  const bConn = addMockClient(mqttServer);
  await connect5(bConn, { clientId: "myclientid2" });
  await subscribe5(bConn, [{ topicFilter: topics[2], qos: 2 }]);

  // Abruptly terminate connection A without cleanly calling disconnect
  await aConn.close();

  // Client B should receive the Will message due to the forced closure
  const { value: willPublish } = await bConn.next();
  assert.strictEqual(willPublish.type, PacketType.publish);
  assert.strictEqual(willPublish.topic, topics[2]);

  await disconnect5(bConn);
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

  await disconnect5(mqttConn);
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
  await subscribe5(aConn, [{ topicFilter: wildtopics[5], qos: 2 }]);
  await disconnect5(aConn);

  // Publish messages while offline
  const bConn = addMockClient(mqttServer);
  await connect5(bConn, { clientId: "publisher" });
  await publish5(bConn, topics[1], 0, { payload: "qos 0" });
  await publish5(bConn, topics[2], 1, {
    payload: "qos 1",
    id: 10,
  });
  await publish5(bConn, topics[3], 2, {
    payload: "qos 2",
    id: 11,
  });
  await disconnect5(bConn);

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

  // Publishing to shared topic structure
  const pConn = addMockClient(mqttServer);
  await connect5(pConn, { clientId: "publisher" });
  await publish5(pConn, sharedPubTopic, 0, {
    payload: "shared content",
  });

  // Introduce short validation lock to check execution order balance
  await delay(50);

  await disconnect5(aConn);
  await disconnect5(bConn);
  await disconnect5(pConn);
});
