import {
  MemoryPersistence as Persistence,
  MemoryStore as Store,
} from "./memoryPersistence.ts";

import assert from "node:assert/strict";
import { test } from "node:test";
import { MQTTLevel, PacketType } from "../deps.ts";
import type { PublishPacket } from "../deps.ts";
import { delay } from "../../dev_utils/mod.ts";

const payloadAny = new TextEncoder().encode("any");
const qos = 1;

test("new should create new Persistence object", () => {
  const persistence = new Persistence();
  assert.deepStrictEqual(typeof persistence, "object");
  assert.deepStrictEqual(persistence instanceof Persistence, true);
});

test(
  "Registering a client should register the client and return a Store Object",
  () => {
    const persistence = new Persistence();
    const clientId = "myClient";
    const { store, existingSession } = persistence.registerClient(
      clientId,
      () => {},
      false,
    );
    assert.deepStrictEqual(persistence.clientList.has(clientId), true);
    assert.deepStrictEqual(typeof store, "object");
    assert.deepStrictEqual(store instanceof Store, true);
    assert.deepStrictEqual(existingSession, false);
  },
);

test("pub/sub should work", async () => {
  const persistence = new Persistence();
  const clientId = "myClient";
  const topic = "/myTopic";
  const publishPacket: PublishPacket = {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    id: 1,
    topic,
    payload: payloadAny,
  };

  function makePacket(id: number | undefined) {
    publishPacket.id = id;
    return publishPacket;
  }
  const seen = new Set();

  function handler(packet: PublishPacket): void {
    seen.add(packet.id);
  }

  const { store } = persistence.registerClient(clientId, handler, false);

  persistence.subscribe(store, topic, qos);
  assert.deepStrictEqual(
    store.subscriptions.has(topic),
    true,
    "topic is registered as subscription",
  );
  persistence.publish(topic, makePacket(25));
  persistence.publish(topic, makePacket(27));
  persistence.publish(topic, makePacket(undefined));
  persistence.publish("noTopic", makePacket(undefined));
  await delay(10);
  assert.deepStrictEqual(seen.size, 3, `received ${seen.size} messages`);
});

test("publish of an empty retained message should clear previous retained message", async () => {
  const persistence = new Persistence();
  const clientId = "myClient";
  const topic = "/myTopic";
  const publishPacket: PublishPacket = {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    id: 1,
    topic,
    payload: payloadAny,
    retain: true,
  };

  function makePacket(id: number | undefined) {
    publishPacket.id = id;
    return publishPacket;
  }
  const seen = new Set();

  function handler(packet: PublishPacket): void {
    seen.add(packet.id);
  }

  const { store } = persistence.registerClient(clientId, handler, false);
  persistence.publish(topic, makePacket(25));
  assert.deepStrictEqual(
    persistence.retained.has(topic),
    true,
    "message is registered as retained",
  );
  persistence.subscribe(store, topic, qos);
  assert.deepStrictEqual(
    store.subscriptions.has(topic),
    true,
    "topic is registered as subscription",
  );
  const updatePacket = makePacket(27);
  updatePacket.payload = new Uint8Array(0);
  persistence.publish(topic, updatePacket);
  await delay(10);
  assert.deepStrictEqual(
    persistence.retained.has(topic),
    false,
    "message is no longer registered as retained",
  );
  assert.deepStrictEqual(seen.size, 1, `received ${seen.size} messages`);
});

test("many packets should work", async () => {
  const persistence = new Persistence();
  const clientId = "myClient";
  const topic = "/myTopic";
  const numMessages = 1000;
  const publishPacket: PublishPacket = {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    id: 1,
    topic,
    payload: payloadAny,
  };

  function makePacket(id: number | undefined) {
    const newPacket = structuredClone(publishPacket);
    newPacket.id = id;
    return newPacket;
  }
  const seen = new Set();

  function handler(packet: PublishPacket): void {
    assert.deepStrictEqual(
      seen.has(packet.id),
      false,
      `Not seen ${packet.id} before`,
    );
    seen.add(packet.id);
  }

  const { store } = persistence.registerClient(clientId, handler, false);

  persistence.subscribe(store, topic, qos);
  assert.deepStrictEqual(
    store.subscriptions.has(topic),
    true,
    "topic is registered as subscription",
  );
  for (let i = 0; i < numMessages; i++) {
    persistence.publish(topic, makePacket(i));
  }
  await delay(10);
  assert.deepStrictEqual(
    seen.size,
    numMessages,
    `received all ${numMessages} messages`,
  );
});

test("unsubscribe should work", () => {
  const persistence = new Persistence();
  const clientId = "myClient";
  const topic = "/myTopic";
  const publishPacket: PublishPacket = {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    id: 1,
    topic,
    payload: payloadAny,
  };

  const seen = new Set();
  function handler(packet: PublishPacket): void {
    assert.deepStrictEqual(
      seen.has(packet.id),
      false,
      `Not seen ${packet.id} before`,
    );
    seen.add(packet.id);
  }

  const { store } = persistence.registerClient(clientId, handler, false);
  persistence.subscribe(store, topic, qos);
  persistence.unsubscribe(store, topic);

  assert.deepStrictEqual(
    store.subscriptions.has(topic),
    false,
    "topic is still registered as subscription after unsubscription",
  );
  persistence.publish(topic, publishPacket);
  assert.deepStrictEqual(seen.size, 0);
});
