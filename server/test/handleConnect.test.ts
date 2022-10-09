import {
  assertEquals,
  Buffer,
  dummyQueueConn,
  dummyReader,
  dummyWriter,
} from "./dev_deps.ts";
import { handlers } from "./test-handlers.ts";
import {
  AnyPacket,
  AuthenticationResult,
  decodePayload,
  encode,
  PacketType,
} from "../../mqttPacket/mod.ts";
import { MqttServer } from "../mod.ts";
import { MqttConn } from "../deps.ts";
import { AsyncQueue, logger, LogLevel, nextTick } from "../../utils/utils.ts";
import { dummyQueueReader } from "../../utils/dev_utils.ts";

const txtEncoder = new TextEncoder();
// logger.level(LogLevel.debug);

const connectPacket: AnyPacket = {
  "type": PacketType.connect,
  "protocolName": "MQTT",
  "protocolLevel": 4,
  "clientId": "testClient",
  "clean": true,
  "keepAlive": 0,
  "username": "IoTester_1",
  "password": txtEncoder.encode("strong_password"),
  "will": undefined,
};

const publishPacket: AnyPacket = {
  "type": PacketType.publish,
  "topic": "hello",
  "payload": txtEncoder.encode("world"),
  "dup": false,
  "retain": false,
  "qos": 0,
  "id": 0,
};

const disconnectPacket: AnyPacket = {
  "type": PacketType.disconnect,
};

const mqttServer = new MqttServer({ handlers });

function startServer(): {
  reader: AsyncIterableIterator<AnyPacket>;
  mqttConn: MqttConn;
} {
  const reader = new AsyncQueue<Uint8Array>();
  const writer = new AsyncQueue<Uint8Array>();

  const outputConn = dummyQueueConn(writer, reader);
  const mqttConn = new MqttConn({ conn: outputConn });
  const inputConn = dummyQueueConn(reader, writer, () => {
    mqttConn.close();
  });
  mqttServer.serve(inputConn);
  return { reader: mqttConn[Symbol.asyncIterator](), mqttConn };
}

Deno.test("Authentication with valid username and password works", async () => {
  const { reader, mqttConn } = startServer();
  mqttConn.send(connectPacket);
  const { value: connack } = await reader.next();
  assertEquals(connack.type, PacketType.connack, "Expect Connack packet");
  if (connack.type === PacketType.connack) {
    assertEquals(connack.returnCode, AuthenticationResult.ok, "Expected OK");
  }
  mqttConn.send(disconnectPacket);
  await nextTick();
  assertEquals(mqttConn.isClosed, true, "Expected connection to be closed");
});

Deno.test("Authentication with invalid username fails", async () => {
  const newPacket = Object.assign({}, connectPacket);
  newPacket.username = "wrong";
  const { reader, mqttConn } = startServer();
  mqttConn.send(newPacket);
  const { value: connack, done } = await reader.next();
  assertEquals(connack.type, PacketType.connack, "Expected Connack packet");
  if (connack.type === PacketType.connack) {
    assertEquals(
      connack.returnCode,
      AuthenticationResult.badUsernameOrPassword,
      "Expected badUsernameOrPassword",
    );
  }
  await nextTick();
  assertEquals(mqttConn.isClosed, true, "Expected connection to be closed");
});

Deno.test("Authentication with invalid password fails", async () => {
  const newPacket = Object.assign({}, connectPacket);
  newPacket.password = undefined;
  const { reader, mqttConn } = startServer();
  mqttConn.send(newPacket);
  const { value: connack, done } = await reader.next();
  assertEquals(connack.type, PacketType.connack, "Expected Connack packet");
  if (connack.type === PacketType.connack) {
    assertEquals(
      connack.returnCode,
      AuthenticationResult.badUsernameOrPassword,
      "Expected badUsernameOrPassword",
    );
  }
  await nextTick();
  assertEquals(mqttConn.isClosed, true, "Expected connection to be closed");
});
