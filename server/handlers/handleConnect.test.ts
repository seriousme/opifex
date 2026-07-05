import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnyPacket } from "../deps.ts";
import { AuthenticationResult, MQTTLevel, PacketType } from "../deps.ts";
import {
  connect,
  disconnect,
  startMockServer,
  startMockServer2,
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
  const { mqttConn1, mqttConn2 } = startMockServer2();
  // start first client
  await mqttConn1.send(connectPacket);
  const { value: connack1 } = await mqttConn1.next();
  assert.deepStrictEqual(
    connack1.type,
    PacketType.connack,
    "Expected first Connack packet",
  );
  // start second client with same id
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

test("Redelivery on reconnect", async () => {
  const clientId = "redeliveryClient";
  const topic = "no/retained/here";
  const { mqttConn1, mqttConn2 } = startMockServer2();
  // start first client
  await connect(mqttConn1, { clientId });
  // Subscribe to topic with no retained message
  mqttConn1.send({
    type: PacketType.subscribe,
    protocolLevel: 4,
    id: 12,
    subscriptions: [{ topicFilter: topic, qos: 1 }],
  });
  const { value: subackPacket } = await mqttConn1.next();
  assert.deepStrictEqual(
    subackPacket.type,
    PacketType.suback,
    "received suback packet",
  );

  await mqttConn1.send({
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    topic,
    payload: txtEncoder.encode("20"),
    retain: false,
    qos: 0,
  });
  const { value: publishedPacket } = await mqttConn1.next();
  assert.deepStrictEqual(
    publishedPacket.type,
    PacketType.publish,
    "received publish packet",
  );
  const publishId = publishedPacket.id;
  await disconnect(mqttConn1);
  assert.deepStrictEqual(
    mqttConn1.isClosed,
    true,
    "Expected first connection to be closed",
  );
  // connect again with same clientId
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
