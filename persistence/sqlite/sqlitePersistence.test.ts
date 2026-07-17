import { test } from "node:test";
import { initializeDatabase } from "./sqliteDatabase.ts";
import { SqlitePersistence } from "./sqlitePersistence.ts";
import { SqliteStorage } from "./sqliteStorage.ts";
import { PacketDirection } from "../storage.ts";
import { MQTTLevel, PacketType } from "../deps.ts";
import assert from "node:assert/strict";

const utf8Encoder = new TextEncoder();

test("SqlitePersistence - Trie is correctly rebuilt (restored) from the database", async () => {
  // Manually create an in-memory (:memory:) database and set up the tables
  const sharedDb = initializeDatabase(":memory:");
  // Simulate an existing state by directly injecting data into the sessions table
  const storage = new SqliteStorage(sharedDb);
  storage.saveSession("Client_A", { existingSession: true });
  storage.saveSession("Client_B", { existingSession: true });
  storage.saveSubscription("Client_A", {
    topicFilter: "sensor/temperature",
    qos: 1,
  });
  storage.saveSubscription("Client_B", { topicFilter: "sensor/#", qos: 2 });
  const persistence = await SqlitePersistence.start(sharedDb);
  const topic = "sensor/temperature";
  await persistence.publish("Client_C", topic, {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    topic,
    payload: utf8Encoder.encode("25 degrees"),
    qos: 2,
  });
  const packetsA = await Array.fromAsync(
    storage.listPendingPackets("Client_A", PacketDirection.Outgoing),
  );
  assert.strictEqual(packetsA[0].topic, topic);
  assert.strictEqual(packetsA[0].qos, 1);
  const packetsB = await Array.fromAsync(
    storage.listPendingPackets("Client_B", PacketDirection.Outgoing),
  );
  assert.strictEqual(packetsB[0].topic, topic);
  assert.strictEqual(packetsB[0].qos, 2);
  persistence.close();
});
