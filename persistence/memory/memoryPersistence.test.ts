import {
  MemoryPersistence as Persistence,
  MemoryStore as Store,
} from "./memoryPersistence.ts";

import { PacketType, PublishPacket } from "../deps.ts";
import { assertEquals } from "../../utils/dev_deps.ts";

const payloadAny = new TextEncoder().encode("any");
const qos = 1;

function delay(ms: number): Promise<unknown> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.test("new should create new Persistence object", () => {
  const persistence = new Persistence();
  assertEquals(typeof persistence, "object");
  assertEquals(persistence instanceof Persistence, true);
});

Deno.test("Registring a client should register the client and return a Store Object", () => {
  const persistence = new Persistence();
  const clientId = "myClient";
  const client = persistence.registerClient(clientId, () => {}, false);
  assertEquals(persistence.clientList.has(clientId), true);
  assertEquals(typeof client, "object");
  assertEquals(client instanceof Store, true);
});

Deno.test("pub/sub should work", async () => {
  const persistence = new Persistence();
  const clientId = "myClient";
  const topic = "/myTopic";
  const publishPacket: PublishPacket = {
    type: PacketType.publish,
    id: 1,
    topic,
    payload: payloadAny,
  };

  function makePacket(id: number | undefined) {
    publishPacket.id = id;
    return publishPacket;
  }
  const seen = new Set();

  async function handler(packet: PublishPacket) {
    seen.add(packet.id);
  }

  const store = persistence.registerClient(clientId, handler, false);

  persistence.subscribe(store, topic, qos);
  assertEquals(
    store.subscriptions.has(topic),
    true,
    "topic is registered as subscription",
  );
  persistence.publish(topic, makePacket(25));
  persistence.publish(topic, makePacket(27));
  persistence.publish(topic, makePacket(undefined));
  persistence.publish("noTopic", makePacket(undefined));
  await delay(10);
  assertEquals(seen.size, 3, `received ${seen.size} messages`);
});

Deno.test("many packets should work", async () => {
  const persistence = new Persistence();
  const clientId = "myClient";
  const topic = "/myTopic";
  const numMessages = 1000;
  const publishPacket: PublishPacket = {
    type: PacketType.publish,
    id: 1,
    topic,
    payload: payloadAny,
  };

  function makePacket(id: number | undefined) {
    const newPacket = Object.assign({}, publishPacket);
    newPacket.id = id;
    return newPacket;
  }
  const seen = new Set();

  async function handler(packet: PublishPacket) {
    assertEquals(seen.has(packet.id), false, `Not seen ${packet.id} before`);
    seen.add(packet.id);
  }

  const store = persistence.registerClient(clientId, handler, false);

  persistence.subscribe(store, topic, qos);
  assertEquals(
    store.subscriptions.has(topic),
    true,
    "topic is registered as subscription",
  );
  for (let i = 0; i < numMessages; i++) {
    persistence.publish(topic, makePacket(i));
  }
  await delay(10);
  assertEquals(seen.size, numMessages, `received all ${numMessages} messages`);
});

Deno.test("unsubscribe should work", () => {
  const persistence = new Persistence();
  const clientId = "myClient";
  const topic = "/myTopic";
  const publishPacket: PublishPacket = {
    type: PacketType.publish,
    id: 1,
    topic,
    payload: payloadAny,
  };

  const seen = new Set();
  async function handler(packet: PublishPacket) {
    assertEquals(seen.has(packet.id), false, `Not seen ${packet.id} before`);
    seen.add(packet.id);
  }

  const store = persistence.registerClient(clientId, handler, false);
  persistence.subscribe(store, topic, qos);
  persistence.unsubscribe(store, topic);

  assertEquals(
    store.subscriptions.has(topic),
    false,
    "topic is still registered as subscription after unsubscription",
  );
  persistence.publish(topic, publishPacket);
  assertEquals(seen.size, 0);
});
