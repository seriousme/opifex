import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type AnyPacket,
  AuthenticationResult,
  PacketType,
} from "../../mqttPacket/mod.ts";
import { MQTTLevel } from "../deps.ts";
import { startMockServer } from "../..//dev_utils/mockServer.ts";

const txtEncoder = new TextEncoder();

const baseConnectPacket: AnyPacket = {
  type: PacketType.connect,
  protocolName: "MQTT",
  protocolLevel: MQTTLevel.v4,
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

test("accepts MQTT 3.1.1 (protocolLevel 4) connection", async () => {
  const { mqttConn } = startMockServer();
  const packet = structuredClone(baseConnectPacket);
  packet.protocolLevel = MQTTLevel.v4;
  mqttConn.send(packet);
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
      "Expected OK for MQTT 3.1.1",
    );
  }
  mqttConn.send(disconnectPacket);
  await mqttConn.next();
  assert.deepStrictEqual(
    mqttConn.isClosed,
    true,
    "Expected connection to be closed cleanly",
  );
});

test("rejects MQTT 3.1 (protocolLevel 3) with unacceptableProtocol", async () => {
  const { mqttConn } = startMockServer();
  const packet = structuredClone(baseConnectPacket);
  packet.protocolLevel = MQTTLevel.v3;
  mqttConn.send(packet);
  const { value: connack } = await mqttConn.next();
  assert.deepStrictEqual(
    connack.type,
    PacketType.connack,
    "Expect Connack packet",
  );
  if (connack.type === PacketType.connack) {
    assert.deepStrictEqual(
      connack.returnCode,
      AuthenticationResult.unacceptableProtocol,
      "Expected unacceptableProtocol for MQTT 3.1",
    );
  }
  await mqttConn.next();
  assert.deepStrictEqual(
    mqttConn.isClosed,
    true,
    "Expected connection to be closed after protocol rejection",
  );
});

test("rejects MQTT 5.0 (protocolLevel 5) with unacceptableProtocol", async () => {
  const { mqttConn } = startMockServer();
  const packet = structuredClone(baseConnectPacket);
  packet.protocolLevel = MQTTLevel.v5;
  mqttConn.send(packet);
  const { value: connack } = await mqttConn.next();
  assert.deepStrictEqual(
    connack.type,
    PacketType.connack,
    "Expect Connack packet",
  );
  if (connack.type === PacketType.connack) {
    assert.deepStrictEqual(
      connack.returnCode,
      AuthenticationResult.unacceptableProtocol,
      "Expected unacceptableProtocol for MQTT 5.0",
    );
  }
  await mqttConn.next();
  assert.deepStrictEqual(
    mqttConn.isClosed,
    true,
    "Expected connection to be closed after protocol rejection",
  );
});
