import { MqttConn, MqttConnError } from "./mqttConn.ts";
import { assertEquals, DummyConn } from "../dev_utils/mod.ts";
import { AnyPacket, encode, PacketType } from "../mqttPacket/mod.ts";

const connectPacket: AnyPacket = {
  type: PacketType.connect,
  protocolName: "MQTT",
  protocolLevel: 4,
  clientId: "testClient",
  clean: true,
  keepAlive: 60,
  username: undefined,
  password: undefined,
  will: undefined,
};

const publishPacket: AnyPacket = {
  type: PacketType.publish,
  topic: "hello",
  payload: new Uint8Array([0x77, 0x6f, 0x72, 0x6c, 0x64]), // "world"
  dup: false,
  retain: false,
  qos: 0,
  id: 0,
};

const disconnectPacket: AnyPacket = {
  type: PacketType.disconnect,
};

Deno.test("MqttConn should act as asyncIterator", async () => {
  const connect = encode(connectPacket);
  const publish = encode(publishPacket);
  const disconnect = encode(disconnectPacket);

  const conn = new DummyConn([connect, publish, disconnect], new Uint8Array());
  const mqttConn = new MqttConn({ conn });

  const packets = [];
  for await (const packet of mqttConn) {
    packets.push(packet);
  }

  assertEquals(packets.length, 3);
  assertEquals(packets[0], connectPacket);
  assertEquals(packets[1], publishPacket);
  assertEquals(packets[2], disconnectPacket);
});

Deno.test("MqttConn should close on malformed length", async () => {
  const conn = new DummyConn([new Uint8Array([1, 175])], new Uint8Array());
  const mqttConn = new MqttConn({ conn });

  const packets = [];
  for await (const packet of mqttConn) {
    packets.push(packet);
  }

  assertEquals(packets.length, 0);
  assertEquals(mqttConn.isClosed, true);
  assertEquals(mqttConn.reason, MqttConnError.UnexpectedEof);
});

Deno.test("MqttConn should close on failed packets", async () => {
  const connect = encode(connectPacket);
  const publish = encode(publishPacket);
  const brokenPublish = publish.slice(0, 7);

  const conn = new DummyConn([connect, brokenPublish], new Uint8Array());
  const mqttConn = new MqttConn({ conn });

  const packets = [];
  for await (const packet of mqttConn) {
    packets.push(packet);
  }

  assertEquals(packets.length, 1);
  assertEquals(packets[0], connectPacket);
  assertEquals(mqttConn.isClosed, true);
  assertEquals(mqttConn.reason, MqttConnError.UnexpectedEof);
});

Deno.test("MqttConn should close on packets too large", async () => {
  const connect = encode(connectPacket);

  const conn = new DummyConn([connect], new Uint8Array());
  const mqttConn = new MqttConn({ conn, maxPacketSize: 20 });
  const packets = [];
  for await (const packet of mqttConn) {
    packets.push(packet);
  }

  assertEquals(packets.length, 0);
  assertEquals(mqttConn.isClosed, true);
  assertEquals(mqttConn.reason, MqttConnError.packetTooLarge);
});

Deno.test("MqttConn should be writable", async () => {
  const connect = encode(connectPacket);
  const writer = new Uint8Array(24);
  const conn = new DummyConn([connect], writer);
  const mqttConn = new MqttConn({ conn });
  await mqttConn.send(connectPacket);
  assertEquals(writer, connect);
});
