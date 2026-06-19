import assert from "node:assert/strict";
import { test } from "node:test";
import { createWebStreamPair, resolveNextTick } from "../../dev_utils/mod.ts";
import {
  type AnyPacket,
  AuthenticationResult,
  PacketType,
} from "../../mqttPacket/mod.ts";
import { MqttConn, MQTTLevel } from "../deps.ts";
import { MqttServer } from "../mod.ts";
import { handlers } from "./test-handlers.ts";

const txtEncoder = new TextEncoder();

const connectPacket: AnyPacket = {
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

function startServer(): {
  mqttConn: MqttConn;
} {
  const mqttServer = new MqttServer({ handlers });
  const { input, output } = createWebStreamPair();
  const mqttConn = new MqttConn({ conn: output });
  mqttServer.serve(input);
  return { mqttConn };
}

test("Authentication with valid username and password works", async () => {
  const { mqttConn } = startServer();
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
  const newPacket = Object.assign({}, connectPacket);
  newPacket.username = "wrong";
  const { mqttConn } = startServer();
  await mqttConn.send(newPacket);
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
  const newPacket = Object.assign({}, connectPacket);
  newPacket.password = undefined;
  const { mqttConn } = startServer();
  await mqttConn.send(newPacket);
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
