import assert from "node:assert/strict";
import { test } from "node:test";
import { initializeDatabase } from "./sqliteDatabase.ts";
import { SQLiteClientSessionStore } from "./sqliteClientSessionStore.ts";

test("SQLiteClientSessionStore persists and deletes session metadata", () => {
  const db = initializeDatabase(":memory:");
  const store = new SQLiteClientSessionStore(db);

  store.set({ clientId: "client-a", existingSession: true });
  assert.deepStrictEqual(store.get("client-a"), {
    clientId: "client-a",
    existingSession: true,
  });

  store.delete("client-a");
  assert.equal(store.get("client-a"), null);
});
