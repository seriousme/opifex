import { test } from "node:test";
import { initializeDatabase } from "./sqliteDatabase.ts";
import { SqlitePersistence } from "./sqlitePersistence.ts";
import type { ClientSubscription } from "./sqlitePersistence.ts";
import assert from "node:assert/strict";

test("SqlitePersistence - Trie is correctly rebuilt (restored) from the database", () => {
  // 1. Manually create an in-memory (:memory:) database and set up the tables
  const sharedDb = initializeDatabase(":memory:");

  // 2. Simulate an existing state by directly injecting data into the subscriptions table
  const insertStmt = sharedDb.prepare(
    "INSERT INTO subscriptions (client_id, topic, qos) VALUES (?, ?, ?)",
  );
  insertStmt.run("client_A", "sensor/temperature", 1);
  insertStmt.run("client_B", "sensor/#", 2);

  // 3. Instantiate SqlitePersistence and pass the pre-populated database.
  // The constructor will internally call `this.rebuildTrie()` immediately.
  const persistence = new SqlitePersistence(sharedDb);

  // Since 'trie' is private, we can test the behavior via the public 'publish'
  // or 'getSubscriptions' method, or temporarily inspect the trie using type casting:
  // deno-lint-ignore no-explicit-any
  const trie = (persistence as any).trie;

  // Test matching for "sensor/temperature"
  const matches: ClientSubscription[] = Array.from(
    trie.match("sensor/temperature"),
  );

  // There should be 2 matches: client_A (exact match) and client_B (via wildcard #)
  assert.strictEqual(matches.length, 2);

  const clientA = matches.find((m: ClientSubscription) =>
    m.clientId === "client_A"
  );
  const clientB = matches.find((m: ClientSubscription) =>
    m.clientId === "client_B"
  );

  assert.ok(clientA, "client_A should have been matched");
  assert.strictEqual(clientA.qos, 1);

  assert.ok(clientB, "client_B should have been matched via wildcard");
  assert.strictEqual(clientB.qos, 2);

  persistence.close();
});
