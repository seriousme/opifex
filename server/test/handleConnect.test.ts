import assert from "node:assert/strict";
import { test } from "node:test";
import { makeDummyQueueSockConn } from "../../dev_utils/mod.ts";
import {
  type AnyPacket,
  AuthenticationResult,
  PacketType,
} from "../../mqttPacket/mod.ts";
import { BufferedAsyncIterable, resolveAsap } from "../../utils/mod.ts";
import { MqttConn, MQTTLevel } from "../deps.ts";
import { MqttServer } from "../mod.ts";
import { handlers } from "./test-handlers.ts";

const txtEncoder = new TextEncoder();
// logger.level(LogLevel.debug);

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

const mqttServer = new MqttServer({ handlers });

function startServer(): {
  reader: AsyncIterator<AnyPacket>;
  mqttConn: MqttConn;
} {
  const reader = new BufferedAsyncIterable<Uint8Array>();
  const writer = new BufferedAsyncIterable<Uint8Array>();

  const outputConn = makeDummyQueueSockConn(writer, reader);
  const mqttConn = new MqttConn({ conn: outputConn });
  const inputConn = makeDummyQueueSockConn(reader, writer, () => {
    mqttConn.close();
  });
  mqttServer.serve(inputConn);
  return { reader: mqttConn[Symbol.asyncIterator](), mqttConn };
}

test("Authentication with valid username and password works", async () => {
  const { reader, mqttConn } = startServer();
  mqttConn.send(connectPacket);
  const { value: connack } = await reader.next();
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
  mqttConn.send(disconnectPacket);
  await resolveAsap();
  assert.deepStrictEqual(
    mqttConn.isClosed,
    true,
    "Expected connection to be closed",
  );
});

test("Authentication with invalid username fails", async () => {
  const newPacket = Object.assign({}, connectPacket);
  newPacket.username = "wrong";
  const { reader, mqttConn } = startServer();
  mqttConn.send(newPacket);
  const { value: connack } = await reader.next();
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
  await resolveAsap();
  assert.deepStrictEqual(
    mqttConn.isClosed,
    true,
    "Expected connection to be closed",
  );
});

test("Authentication with invalid password fails", async () => {
  const newPacket = Object.assign({}, connectPacket);
  newPacket.password = undefined;
  const { reader, mqttConn } = startServer();
  mqttConn.send(newPacket);
  const { value: connack } = await reader.next();
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
  await resolveAsap();
  assert.deepStrictEqual(
    mqttConn.isClosed,
    true,
    "Expected connection to be closed",
  );
});
