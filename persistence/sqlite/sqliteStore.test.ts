import assert from "node:assert/strict";
import { test } from "node:test";
import { initializeDatabase } from "./sqliteDatabase.ts";
import { SqliteStore } from "./sqliteStore.ts";

test("SqliteStore generates unique packet IDs", async () => {
  const db = initializeDatabase(":memory:");
  const store = new SqliteStore(db, "client-a");

  const first = await store.nextId();
  const second = await store.nextId();

  assert.equal(first > 0, true);
  assert.equal(second > first, true);
});
