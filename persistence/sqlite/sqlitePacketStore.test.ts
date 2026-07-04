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

test("SqlitePacketStore round-trips packets and exposes iteration helpers", () => {
  const db = initializeDatabase(":memory:");
  const store = new SqlitePacketStore(db, "client-a", [[1, makePacket(1)]]);

  store.set(2, makePacket(2));

  assert.equal(store.size, 2);
  assert.deepStrictEqual(store.get(1)?.topic, "/topic/1");
  assert.equal(store.has(2), true);
  assert.equal(store.delete(2), true);
  assert.equal(store.delete(2), false);

  const keys = [...store.keys()];
  assert.deepStrictEqual(keys, [1]);
  store.clear();
  assert.equal(store.size, 0);
});
