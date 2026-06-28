import assert from "node:assert/strict";
import { test } from "node:test";
import { initializeDatabase } from "./sqliteDatabase.ts";
import { SqliteSubscriptionStore } from "./sqliteSubscriptionStore.ts";

test("SqliteSubscriptionStore stores and retrieves topic subscriptions", () => {
  const db = initializeDatabase(":memory:");
  const store = new SqliteSubscriptionStore(db, "client-a", [["/a", 1]]);

  store.set("/b", 2);

  assert.equal(store.size, 2);
  assert.equal(store.get("/a"), 1);
  assert.equal(store.has("/b"), true);
  assert.deepStrictEqual([...store.keys()], ["/a", "/b"]);
  assert.deepStrictEqual([...store.values()], [1, 2]);
  assert.deepStrictEqual([...store.entries()], [["/a", 1], ["/b", 2]]);

  assert.equal(store.delete("/a"), true);
  assert.equal(store.delete("/a"), false);
  store.clear();
  assert.equal(store.size, 0);
});
