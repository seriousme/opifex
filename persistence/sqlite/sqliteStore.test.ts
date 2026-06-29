import assert from "node:assert/strict";
import { test } from "node:test";
import { initializeDatabase } from "./sqliteDatabase.ts";
import { SqliteStore } from "./sqliteStore.ts";

test("SqliteStore generates unique packet IDs", () => {
  const db = initializeDatabase(":memory:");
  const store = new SqliteStore(db, "client-a");

  const first = store.nextId();
  const second = store.nextId();

  assert.equal(first > 0, true);
  assert.equal(second > first, true);
});
