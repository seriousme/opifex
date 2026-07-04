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
    false,
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
    false,
  );
  await persistence.subscribe(store1, "/topic", qos);
  const { store: store2 } = await persistence.registerClient(
    clientId,
    handler,
    true,
  );
  assert.deepStrictEqual(await store2.subscriptions.size(), 0);
});

test("Registering a client with no-clean should reinstate persisted state", async () => {
  const persistence = new SqlitePersistence();
  const clientId = "sqliteClient";
  const handler = () => {};
  const { store: store1 } = await persistence.registerClient(
    clientId,
    handler,
    false,
  );
  await persistence.subscribe(store1, "/topic", qos);
  const { store: store2 } = await persistence.registerClient(
    clientId,
    handler,
    false,
  );
  assert.deepStrictEqual(await store2.subscriptions.size(), 1);
});

test("publish should deliver retained and subscription messages", async () => {
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

  const { store } = await persistence.registerClient(clientId, handler, false);
  await persistence.subscribe(store, topic, qos);
  await persistence.publish(topic, publishPacket);
  assert.deepStrictEqual(seen.has(1), true);
});
