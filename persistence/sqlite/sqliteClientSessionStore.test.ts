import assert from "node:assert/strict";
import { test } from "node:test";
import { initializeDatabase } from "./sqliteDatabase.ts";
import { SqliteClientSessionStore } from "./sqliteClientSessionStore.ts";

test("SqliteClientSessionStore persists and deletes session metadata", () => {
  const db = initializeDatabase(":memory:");
  const store = new SqliteClientSessionStore(db);

  store.set({ clientId: "client-a", existingSession: true });
  assert.deepStrictEqual(store.get("client-a"), {
    clientId: "client-a",
    existingSession: true,
  });

  const clients = Array.from(store.keys());
  assert.deepStrictEqual(clients, ["client-a"]);

  store.delete("client-a");
  assert.equal(store.get("client-a"), null);
});
