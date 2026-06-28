import assert from "node:assert/strict";
import { test } from "node:test";
import { SQLitePersistence } from "./sqlitePersistence.ts";
import { SQLiteStore } from "./sqliteStore.ts";
import { MQTTLevel, PacketType } from "../deps.ts";
import type { PublishPacket } from "../deps.ts";

const payloadAny = new TextEncoder().encode("any");
const qos = 1;

test("new should create new SQLitePersistence object", () => {
  const persistence = new SQLitePersistence();
  assert.deepStrictEqual(typeof persistence, "object");
  assert.deepStrictEqual(persistence instanceof SQLitePersistence, true);
});

test("Registering a client should return a SQLiteStore object", () => {
  const persistence = new SQLitePersistence();
  const clientId = "sqliteClient";
  const { store, existingSession } = persistence.registerClient(
    clientId,
    () => {},
    false,
  );
  assert.deepStrictEqual(persistence.clientList.has(clientId), true);
  assert.deepStrictEqual(typeof store, "object");
  assert.deepStrictEqual(store instanceof SQLiteStore, true);
  assert.deepStrictEqual(existingSession, false);
});

test("Registering a client with clean should reset persisted state", () => {
  const persistence = new SQLitePersistence();
  const clientId = "sqliteClient";
  const handler = () => {};
  const { store: store1 } = persistence.registerClient(
    clientId,
    handler,
    false,
  );
  persistence.subscribe(store1, "/topic", qos);
  persistence.deregisterClient(clientId);
  const { store: store2 } = persistence.registerClient(
    clientId,
    handler,
    false,
  );
  assert.deepStrictEqual(store2.subscriptions.size, 0);
});

test("publish should deliver retained and subscription messages", () => {
  const persistence = new SQLitePersistence();
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

  const { store } = persistence.registerClient(clientId, handler, false);
  persistence.subscribe(store, topic, qos);
  persistence.publish(topic, publishPacket);
  assert.deepStrictEqual(seen.has(1), true);
});
