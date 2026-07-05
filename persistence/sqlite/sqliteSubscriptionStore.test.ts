import assert from "node:assert/strict";
import { test } from "node:test";
import { initializeDatabase } from "./sqliteDatabase.ts";
import { SqliteSubscriptionStore } from "./sqliteSubscriptionStore.ts";

test("SqliteSubscriptionStore stores and retrieves topic subscriptions", async () => {
  const db = initializeDatabase(":memory:");
  const store = new SqliteSubscriptionStore(db, "client-a");

  store.set("/a", 1);
  store.set("/b", 2);
  const keys = [];
  for await (const key of store.keys()) {
    keys.push(key);
  }

  assert.equal(await store.size(), 2);
  assert.equal(await store.get("/a"), 1);
  assert.equal(await store.has("/b"), true);
  assert.deepStrictEqual(keys, ["/a", "/b"]);

  assert.equal(await store.delete("/a"), true);
  assert.equal(await store.delete("/a"), false);
  await store.clear();
  assert.equal(await store.size(), 0);
});
