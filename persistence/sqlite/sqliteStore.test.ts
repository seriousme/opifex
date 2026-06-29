import assert from "node:assert/strict";
import { test } from "node:test";
import { initializeDatabase } from "./sqliteDatabase.ts";
import { SQLiteStore } from "./sqliteStore.ts";

test("SQLiteStore generates unique packet IDs", () => {
  const db = initializeDatabase(":memory:");
  const store = new SQLiteStore(db, "client-a");

  const first = store.nextId();
  const second = store.nextId();

  assert.equal(first > 0, true);
  assert.equal(second > first, true);
});
