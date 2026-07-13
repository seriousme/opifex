import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnyPacket } from "../deps.ts";
import { AuthenticationResult, PacketType } from "../deps.ts";
import {
  addMockClient,
  connect,
  disconnect,
  ping,
  publish,
  startMockServer,
  subscribe,
} from "../../dev_utils/mod.ts";

const txtEncoder = new TextEncoder();

const baseConnectPacket: AnyPacket = {
  type: PacketType.connect,
  protocolName: "MQTT",
  protocolLevel: 4,
  clientId: "testClient",
  clean: true,
  keepAlive: 0,
  username: "IoTester_1",
  password: txtEncoder.encode("strong_password"),
  will: undefined,
};

test("Authentication with valid username and password works", async () => {
  const connectPacket = structuredClone(baseConnectPacket);
  const { mqttConn } = startMockServer();
  mqttConn.send(connectPacket);
  const { value: connack } = await mqttConn.next();
  assert.deepStrictEqual(
    connack.type,
    PacketType.connack,
    "Expect Connack packet",
  );
  if (connack.type === PacketType.connack) {
    assert.deepStrictEqual(
      connack.returnCode,
      AuthenticationResult.ok,
      "Expected OK",
    );
  }
  await disconnect(mqttConn);
});

test("Authentication with invalid username fails", async () => {
  const connectPacket = structuredClone(baseConnectPacket);
  connectPacket.username = "wrong";
  const { mqttConn } = startMockServer();
  await mqttConn.send(connectPacket);
  const { value: connack } = await mqttConn.next();
  assert.deepStrictEqual(
    connack.type,
    PacketType.connack,
    "Expected Connack packet",
  );
  if (connack.type === PacketType.connack) {
    assert.deepStrictEqual(
      connack.returnCode,
      AuthenticationResult.badUsernameOrPassword,
      "Expected badUsernameOrPassword",
    );
  }
  await mqttConn.next();
  assert.deepStrictEqual(
    mqttConn.isClosed,
    true,
    "Expected connection to be closed",
  );
});

test("Authentication with invalid password fails", async () => {
  const connectPacket = structuredClone(baseConnectPacket);
  connectPacket.password = undefined;
  const { mqttConn } = startMockServer();
  await mqttConn.send(connectPacket);
  const { value: connack } = await mqttConn.next();
  assert.deepStrictEqual(
    connack.type,
    PacketType.connack,
    "Expected Connack packet",
  );
  if (connack.type === PacketType.connack) {
    assert.deepStrictEqual(
      connack.returnCode,
      AuthenticationResult.badUsernameOrPassword,
      "Expected badUsernameOrPassword",
    );
  }
  await mqttConn.next();
  assert.deepStrictEqual(
    mqttConn.isClosed,
    true,
    "Expected connection to be closed",
  );
});

test("Two connect messages on same connection closes connection", async () => {
  const connectPacket = structuredClone(baseConnectPacket);
  const { mqttConn } = startMockServer();
  await mqttConn.send(connectPacket);
  const { value: connack } = await mqttConn.next();
  assert.deepStrictEqual(
    connack.type,
    PacketType.connack,
    "Expect Connack packet",
  );
  if (connack.type === PacketType.connack) {
    assert.deepStrictEqual(
      connack.returnCode,
      AuthenticationResult.ok,
      "Expected OK",
    );
  }
  await mqttConn.send(connectPacket);
  const { value: connack2 } = await mqttConn.next();
  assert.deepStrictEqual(connack2, undefined, "Expected no second connack");
  assert.deepStrictEqual(
    mqttConn.isClosed,
    true,
    "Expected connection to be closed",
  );
});

test("Second session with same client id closes the first", async () => {
  const connectPacket = structuredClone(baseConnectPacket);
  const { mqttConn: mqttConn1, mqttServer } = startMockServer();
  // start first client
  await mqttConn1.send(connectPacket);
  const { value: connack1 } = await mqttConn1.next();
  assert.deepStrictEqual(
    connack1.type,
    PacketType.connack,
    "Expected first Connack packet",
  );
  // start second client with same id
  const mqttConn2 = addMockClient(mqttServer);
  await mqttConn2.send(connectPacket);
  const { value: connack2 } = await mqttConn2.next();
  assert.deepStrictEqual(
    connack2.type,
    PacketType.connack,
    "Expected second Connack packet",
  );

  await mqttConn1.next();
  assert.deepStrictEqual(
    mqttConn1.isClosed,
    true,
    "Expected first connection to be closed",
  );
  assert.deepStrictEqual(
    mqttConn2.isClosed,
    false,
    "Expected second connection not to be closed",
  );
  await disconnect(mqttConn2);
});

test("Redelivery on reconnect after failed delivery", async () => {
  const clientId = "redeliveryClient";
  const topic = "no/retained/here";
  const { mqttConn: mqttConn1, mqttServer } = startMockServer();
  // start first client
  await connect(mqttConn1, { clientId });
  // Subscribe to topic with no retained message
  await subscribe(mqttConn1, [{ topicFilter: topic, qos: 1 }]);
  // checkAcks=false as the first packet returned will be the publish, not the ack.
  await publish(mqttConn1, topic, 1, {}, false);
  // first reception on our subscription
  const { value: publishPacket } = await mqttConn1.next();
  assert.deepStrictEqual(
    publishPacket.type,
    PacketType.publish,
    "received publish packet again",
  );
  const publishId = publishPacket.id;
  await mqttConn1.next(); // the puback on the publish we sent out
  await disconnect(mqttConn1);
  assert.deepStrictEqual(
    mqttConn1.isClosed,
    true,
    "Expected first connection to be closed",
  );
  // connect again with same clientId
  const mqttConn2 = addMockClient(mqttServer);
  await connect(mqttConn2, { clientId, clean: false });
  // expect published packet to be redelivered because we did not ack
  const { value: packet } = await mqttConn2.next();
  assert.deepStrictEqual(
    packet.type,
    PacketType.publish,
    "received publish packet again",
  );
  assert.deepStrictEqual(
    packet.id,
    publishId,
    "packetid is the same as on original delivery",
  );
  await disconnect(mqttConn2);
});

test("Delivery of messages with QoS 1 or QoS2 received while offline", async () => {
  const clientId = "offlineClient";
  const { mqttConn: mqttConn1, mqttServer } = startMockServer();
  // start first client
  await connect(mqttConn1, { clientId });
  // Subscribe to topic with no retained message
  await subscribe(mqttConn1, [{ topicFilter: "offline/+", qos: 1 }]);
  // hangup
  await disconnect(mqttConn1);

  //  connect the publisher
  const mqttConn2 = addMockClient(mqttServer);
  await connect(mqttConn2, { clientId: "publisher" });
  await publish(mqttConn2, "offline/q0", 0, { id: 10 });
  await publish(mqttConn2, "offline/q1", 1, { id: 11 });
  await publish(mqttConn2, "offline/q2", 2, { id: 12 });
  await disconnect(mqttConn2);

  // connect again with same clientId as the initial connect
  const mqttConn3 = addMockClient(mqttServer);
  await connect(mqttConn3, { clientId, clean: false });
  // expect published packet that was delivered while offline
  const { value: packetQos1 } = await mqttConn3.next();
  assert.deepStrictEqual(
    packetQos1.type,
    PacketType.publish,
    "received publish packet",
  );
  assert.deepStrictEqual(
    packetQos1.topic,
    "offline/q1",
    "topic is expected",
  );
  const { value: packetQos2 } = await mqttConn3.next();
  assert.deepStrictEqual(
    packetQos2.type,
    PacketType.publish,
    "received publish packet",
  );
  assert.deepStrictEqual(
    packetQos2.topic,
    "offline/q2",
    "topic is expected",
  );
  await ping(mqttConn3);
  await disconnect(mqttConn3);
});
