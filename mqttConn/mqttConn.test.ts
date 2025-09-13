import assert from "node:assert/strict";
import { test } from "node:test";
import { makeDummySockConn } from "../dev_utils/mod.ts";
import { encode, MQTTLevel, PacketType } from "../mqttPacket/mod.ts";
import { MqttConn, MqttConnError } from "./mqttConn.ts";
import type { AnyPacket, CodecOpts } from "../mqttPacket/mod.ts";

const codecOptsV4: CodecOpts = {
  protocolLevel: MQTTLevel.v4,
  maxIncomingPacketSize: 0xffff,
  maxOutgoingPacketSize: 0xffff,
};

const codecOptsUnknown: CodecOpts = {
  protocolLevel: MQTTLevel.unknown,
  maxIncomingPacketSize: 0xffff,
  maxOutgoingPacketSize: 0xffff,
};

const connectPacket: AnyPacket = {
  type: PacketType.connect,
  protocolName: "MQTT",
  protocolLevel: MQTTLevel.v4,
  clientId: "testClient",
  clean: true,
  keepAlive: 60,
  username: undefined,
  password: undefined,
  will: undefined,
};

const publishPacket: AnyPacket = {
  type: PacketType.publish,
  protocolLevel: MQTTLevel.v4,
  topic: "hello",
  payload: new Uint8Array([0x77, 0x6f, 0x72, 0x6c, 0x64]), // "world"
  dup: false,
  retain: false,
  qos: 0,
  id: undefined,
};

const disconnectPacket: AnyPacket = {
  type: PacketType.disconnect,
  protocolLevel: MQTTLevel.v4,
};

test("MqttConn should act as asyncIterator", async () => {
  const connect = encode(connectPacket, codecOptsUnknown);
  const publish = encode(publishPacket, codecOptsV4);
  const disconnect = encode(disconnectPacket, codecOptsV4);

  const conn = makeDummySockConn(
    [connect, publish, disconnect],
    new Uint8Array(),
  );
  const mqttConn = new MqttConn({ conn, protocolLevel: 4 });

  const packets = [];
  for await (const packet of mqttConn) {
    packets.push(packet);
  }

  assert.deepStrictEqual(packets.length, 3);
  assert.deepStrictEqual(packets[0], connectPacket);
  assert.deepStrictEqual(packets[1], publishPacket);
  assert.deepStrictEqual(packets[2], disconnectPacket);
});

test("MqttConn should close on malformed length", async () => {
  const conn = makeDummySockConn([new Uint8Array([1, 175])], new Uint8Array());
  const mqttConn = new MqttConn({ conn });

  const packets = [];
  for await (const packet of mqttConn) {
    packets.push(packet);
  }

  assert.deepStrictEqual(packets.length, 0);
  assert.deepStrictEqual(mqttConn.isClosed, true);
  assert.deepStrictEqual(mqttConn.reason, MqttConnError.UnexpectedEof);
});

test("MqttConn should close on failed packets", async () => {
  const connect = encode(connectPacket, codecOptsV4);
  const publish = encode(publishPacket, codecOptsV4);
  const brokenPublish = publish.slice(0, 7);

  const conn = makeDummySockConn([connect, brokenPublish], new Uint8Array());
  const mqttConn = new MqttConn({ conn });

  const packets = [];
  for await (const packet of mqttConn) {
    packets.push(packet);
  }

  assert.deepStrictEqual(packets.length, 1);
  assert.deepStrictEqual(packets[0], connectPacket);
  assert.deepStrictEqual(mqttConn.isClosed, true);
  assert.deepStrictEqual(mqttConn.reason, MqttConnError.UnexpectedEof);
});

test("MqttConn should close on packets too large", async () => {
  const connect = encode(connectPacket, codecOptsV4);

  const conn = makeDummySockConn([connect], new Uint8Array());
  const mqttConn = new MqttConn({ conn, maxIncomingPacketSize: 20 });
  const packets = [];
  for await (const packet of mqttConn) {
    packets.push(packet);
  }

  assert.deepStrictEqual(packets.length, 0);
  assert.deepStrictEqual(mqttConn.isClosed, true);
  assert.deepStrictEqual(mqttConn.reason, MqttConnError.packetTooLarge);
});

test("MqttConn should be writable", async () => {
  const connect = encode(connectPacket, codecOptsV4);
  const writer = new Uint8Array(24);
  const conn = makeDummySockConn([connect], writer);
  const mqttConn = new MqttConn({ conn });
  await mqttConn.send(connectPacket);
  assert.deepStrictEqual(writer, connect);
});
