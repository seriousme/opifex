import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type AnyPacket,
  AuthenticationResult,
  PacketType,
} from "../../mqttPacket/mod.ts";
import { MQTTLevel } from "../deps.ts";
import { startMockServer } from "../../dev_utils/mockServer.ts";

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

const disconnectPacket: AnyPacket = {
  type: PacketType.disconnect,
  protocolLevel: MQTTLevel.v4,
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
  await mqttConn.send(disconnectPacket);
  await mqttConn.next();
  assert.deepStrictEqual(
    mqttConn.isClosed,
    true,
    "Expected connection to be closed",
  );
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
