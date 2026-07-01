import assert from "node:assert/strict";
import { test } from "node:test";
import { MQTTLevel, PacketType } from "../deps.ts";
import type { PublishPacket } from "../deps.ts";
import { initializeDatabase } from "./sqliteDatabase.ts";
import { SqliteRetainStore } from "./sqliteRetainStore.ts";

function makePacket(topic: string, payload = "payload"): PublishPacket {
  return {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    id: 1,
    topic,
    payload: new TextEncoder().encode(payload),
    retain: true,
  };
}

test("SqliteRetainStore stores and matches retained packets", () => {
  const db = initializeDatabase(":memory:");
  const retainStore = new SqliteRetainStore(db);

  retainStore.set("room/1", makePacket("room/1"));
  retainStore.set("room/2", makePacket("room/2"));

  const exactMatches = [...retainStore.matches("room/1")];
  const wildcardMatches = [...retainStore.matches("room/#")];
  const singleLevelMatches = [...retainStore.matches("+/2")];

  assert.equal(exactMatches.length, 1);
  assert.equal(exactMatches[0]?.topic, "room/1");
  assert.equal(wildcardMatches.length, 2);
  assert.equal(singleLevelMatches.length, 1);

  retainStore.delete("room/1");
  assert.equal([...retainStore.matches("room/1")].length, 0);
});
