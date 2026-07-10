import assert from "node:assert/strict";
import { test } from "node:test";
import { SqlitePersistence } from "./sqlitePersistence.ts";
import { SqliteStore } from "./sqliteStore.ts";
import { MQTTLevel, PacketType } from "../deps.ts";
import type { PublishPacket } from "../deps.ts";

const payloadAny = new TextEncoder().encode("any");
const qos = 1;

test("new should create new SqlitePersistence object", () => {
  const persistence = new SqlitePersistence();
  assert.deepStrictEqual(typeof persistence, "object");
  assert.deepStrictEqual(persistence instanceof SqlitePersistence, true);
});

test("Registering a client should return a SqliteStore object", async () => {
  const persistence = new SqlitePersistence();
  const clientId = "sqliteClient";
  const { store, existingSession } = await persistence.registerClient(
    clientId,
    () => {},
  );
  assert.deepStrictEqual(persistence.clientList.has(clientId), true);
  assert.deepStrictEqual(typeof store, "object");
  assert.deepStrictEqual(store instanceof SqliteStore, true);
  assert.deepStrictEqual(existingSession, false);
});

test("Registering a client with clean should reset persisted state", async () => {
  const persistence = new SqlitePersistence();
  const clientId = "sqliteClient";
  const handler = () => {};
  const { store: store1 } = await persistence.registerClient(
    clientId,
    handler,
  );
  await persistence.subscribe(store1, "/topic", qos);
  await persistence.deregisterClient(clientId);
  const { store: store2 } = await persistence.registerClient(
    clientId,
    handler,
  );
  assert.deepStrictEqual(await store2.subscriptions.size(), 0);
});

test("Registering a client with no-clean should keep persisted state", async () => {
  const persistence = new SqlitePersistence();
  const clientId = "sqliteClient";
  const handler = () => {};
  const { store: store1 } = await persistence.registerClient(
    clientId,
    handler,
  );
  await persistence.subscribe(store1, "/topic", qos);
  const { store: store2 } = await persistence.registerClient(
    clientId,
    handler,
  );
  assert.deepStrictEqual(await store2.subscriptions.size(), 1);
});

test("Publish should deliver retained and subscription messages", async () => {
  const persistence = new SqlitePersistence();
  const clientId = "sqliteClient";
  const topic = "/myTopic";
  const publishPacket: PublishPacket = {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    id: 1,
    topic,
    payload: payloadAny,
  };

  const seen = new Set<number | undefined>();
  function handler(packet: PublishPacket): void {
    seen.add(packet.id);
  }

  const { store } = await persistence.registerClient(clientId, handler);
  await persistence.subscribe(store, topic, qos);
  await persistence.publish(topic, publishPacket);
  assert.deepStrictEqual(seen.has(1), true);
});

test("Initialize should reload clients and subscriptions from storage", async () => {
  const persistence = new SqlitePersistence();
  const clientId = "persistedClient";
  const topic = "/restoredTopic";
  const qos = 1;
  const numSubs= 10;
  const handler = () => {};

  // Register a client and create a subscription
  const { store: originalStore } = await persistence.registerClient(
    clientId,
    handler,
  );

  for (let index = 0; index < numSubs; index++) {
    await persistence.subscribe(originalStore, `${topic}-${index}`, qos);
  }

  assert.deepStrictEqual(await originalStore.subscriptions.size(), numSubs);
  const subs = [];
  for await (const topicFilter of originalStore.subscriptions.keys()) {
    const qos = await originalStore.subscriptions.get(topicFilter);
    subs.push({ topicFilter, qos });
  }
  // Close the database connection cleanly
  persistence.close();

  // Create a new persistence instance targeting the same database state.
  // Since ":memory:" is unique per instance when using the default string,
  // we simulate the restart by saving the records to the new instance's sessionStore.
  const newPersistence = new SqlitePersistence();
  const newStore = new SqliteStore(newPersistence.db, clientId);
  for (const { topicFilter, qos } of subs) {
    await newStore.subscriptions.set(topicFilter, qos!);
  }
  newPersistence.sessionStore.set({clientId,existingSession:true})

  // Verify that the new instance is empty before initialization
  assert.deepStrictEqual(newPersistence.clientList.has(clientId), false);

  // Initialize the new persistence layer
  await newPersistence.initialize();

  // Verify that the client and its subscriptions have been restored
  assert.deepStrictEqual(newPersistence.clientList.has(clientId), true);

  const restoredClient = newPersistence.clientList.get(clientId);
  assert.ok(restoredClient);
  assert.deepStrictEqual(await restoredClient.store.subscriptions.size(), numSubs);

  // Verify that the trie correctly matches the restored subscription during a publish
  const seen = new Set<number | undefined>();
  restoredClient.handler = (packet: PublishPacket) => {
    seen.add(packet.id);
  };

  const publishPacket: PublishPacket = {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    id: 99,
    topic: `${topic}-1`,
    payload: payloadAny,
  };

  await newPersistence.publish(`${topic}-1`, publishPacket);
  assert.deepStrictEqual(seen.has(99), true);
});
