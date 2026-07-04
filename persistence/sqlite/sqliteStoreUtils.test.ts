import assert from "node:assert/strict";
import { test } from "node:test";
import { MQTTLevel, PacketType } from "../deps.ts";
import type { PublishPacket } from "../deps.ts";
import {
  createIterator,
  deserializePacket,
  serializePacket,
} from "./sqliteStoreUtils.ts";

test("serializePacket and deserializePacket round-trip payloads", () => {
  const packet: PublishPacket = {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    id: 7,
    topic: "/topic",
    payload: new TextEncoder().encode("hello"),
    retain: true,
  };

  const serialized = serializePacket(packet);
  const restored = deserializePacket(serialized.packet, serialized.payload);

  assert.equal(restored.topic, packet.topic);
  assert.equal(restored.id, packet.id);
  assert.equal(restored.retain, packet.retain);
  assert.deepStrictEqual(restored.payload, packet.payload);
});

test("createIterator maps underlying rows", async () => {
  const values = [1, 2, 3];
  const iterator = await createIterator(values.values(), (value) => value * 2);
  const mapped = [...iterator];

  assert.deepStrictEqual(mapped, [2, 4, 6]);
});
