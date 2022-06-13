import {
  assertEquals,
  Buffer,
  dummyConn,
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

const txtEncoder = new TextEncoder();

const connectPacket: AnyPacket = {
  "type": PacketType.connect,
  "protocolName": "MQTT",
  "protocolLevel": 4,
  "clientId": "testClient",
  "clean": true,
  "keepAlive": 60,
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

const connect = encode(connectPacket);
const publish = encode(publishPacket);
const disconnect = encode(disconnectPacket);

const mqttServer = new MqttServer({ handlers });

async function testServer(inputPackets: AnyPacket[]): Promise<AnyPacket[]> {
  const input = inputPackets.map((pkt) => encode(pkt));
  const output: Uint8Array[] = [];
  const closed = false;
  const reader = dummyReader(input);
  const resultReader = dummyReader(output);
  const writer = dummyWriter(output, closed);
  const conn = dummyConn(reader, writer);
  await mqttServer.serve(conn);
  const resultConn = dummyConn(resultReader, new Buffer());
  const mqttConn = new MqttConn({ conn: resultConn });
  const packets = [];
  for await (const packet of mqttConn) {
    packets.push(packet);
  }
  return packets;
}

Deno.test("Authentication with valid username and password works", async () => {
  const [connack, ...rest] = await testServer([connectPacket]);
  assertEquals(connack.type, PacketType.connack, "Expected Connack packet");
  if (connack.type === PacketType.connack) {
    assertEquals(connack.returnCode, AuthenticationResult.ok, "Expected OK");
  }
});

Deno.test("Authentication with invalid username fails", async () => {
  const newPacket = Object.assign({}, connectPacket);
  newPacket.username = "wrong";
  const [connack, ...rest] = await testServer([newPacket]);
  assertEquals(connack.type, PacketType.connack, "Expected Connack packet");
  if (connack.type === PacketType.connack) {
    assertEquals(
      connack.returnCode,
      AuthenticationResult.badUsernameOrPassword,
      "Expected badUsernameOrPassword",
    );
  }
});

Deno.test("Authentication with invalid password fails", async () => {
  const newPacket = Object.assign({}, connectPacket);
  newPacket.password = undefined;
  const [connack, ...rest] = await testServer([newPacket]);
  assertEquals(connack.type, PacketType.connack, "Expected Connack packet");
  if (connack.type === PacketType.connack) {
    assertEquals(
      connack.returnCode,
      AuthenticationResult.badUsernameOrPassword,
      "Expected badUsernameOrPassword",
    );
  }
});
