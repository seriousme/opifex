import assert from "node:assert/strict";
import { test } from "node:test";
import { SqlitePacketIdStore } from "./sqlitePacketIdStore.ts";
import { initializeDatabase } from "./sqliteDatabase.ts";

test("SqlitePacketIdStore persists packet IDs for a client", async () => {
  const db = initializeDatabase(":memory:");
  const store = new SqlitePacketIdStore(db, "client-a");
  await store.add(1);
  await store.add(2);

  const keys = [];
  for await (const key of store.keys()) {
    keys.push(key);
  }
  assert.equal(await store.size(), 2);
  assert.equal(await store.has(1), true);
  assert.equal(await store.has(3), false);
  assert.deepStrictEqual(
    keys.sort(),
    [1, 2],
  );

  assert.equal(await store.delete(1), true);
  assert.equal(await store.delete(1), false);
  await store.clear();
  assert.equal(await store.size(), 0);
});
