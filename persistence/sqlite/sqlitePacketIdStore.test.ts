import assert from "node:assert/strict";
import { test } from "node:test";
import { SqlitePacketIdStore } from "./sqlitePacketIdStore.ts";
import { initializeDatabase } from "./sqliteDatabase.ts";

test("SqlitePacketIdStore persists packet IDs for a client", () => {
  const db = initializeDatabase(":memory:");
  const store = new SqlitePacketIdStore(db, "client-a", "pending_incoming", [
    1,
    2,
  ]);

  assert.equal(store.size, 2);
  assert.equal(store.has(1), true);
  assert.equal(store.has(3), false);
  assert.deepStrictEqual(
    [...store.keys()].sort((left, right) => left - right),
    [1, 2],
  );

  assert.equal(store.delete(1), true);
  assert.equal(store.delete(1), false);
  store.clear();
  assert.equal(store.size, 0);
});
