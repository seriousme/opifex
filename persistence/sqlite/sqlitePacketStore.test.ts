import assert from "node:assert/strict";
import { test } from "node:test";
import { MQTTLevel, PacketType } from "../deps.ts";
import type { PublishPacket } from "../deps.ts";
import { initializeDatabase } from "./sqliteDatabase.ts";
import { SqlitePacketStore } from "./sqlitePacketStore.ts";

function makePacket(id: number): PublishPacket {
  return {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    id,
    topic: `/topic/${id}`,
    payload: new TextEncoder().encode(`payload-${id}`),
  };
}

test("SqlitePacketStore round-trips packets", async () => {
  const db = initializeDatabase(":memory:");
  const store = new SqlitePacketStore(db, "client-a");

  store.set(1, makePacket(1));
  store.set(2, makePacket(2));

  assert.equal(await store.size(), 2);
  assert.deepStrictEqual((await store.get(1))?.topic, "/topic/1");
  assert.equal(await store.has(2), true);
  assert.equal(await store.delete(2), true);
  assert.equal(await store.delete(2), false);

  const keys = [];
  for await (const key of store.keys()) {
    keys.push(key);
  }
  assert.deepStrictEqual(keys, [1]);
  await store.clear();
  assert.equal(await store.size(), 0);
});
