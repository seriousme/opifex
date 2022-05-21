import {
  MemoryClient as Client,
  MemoryPersistence as Persistence,
} from "./memoryPersistence.ts";

import { Packet, PacketStore } from "../persistence.ts";
import { assertEquals, PacketType } from "../deps.ts";

const payloadAny = new TextEncoder().encode("any");
const qos = 0;

function delay(ms: number): Promise<unknown> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.test("new should create new Persistence object", () => {
  const persistence = new Persistence();
  assertEquals(typeof persistence, "object");
  assertEquals(persistence instanceof Persistence, true);
});

Deno.test("Registring a client should register the client and return a Client Object", () => {
  const persistence = new Persistence();
  const clientId = "myClient";
  const client = persistence.registerClient(clientId, () => {}, () => {});
  assertEquals(persistence.clientList.has(clientId), true);
  assertEquals(typeof client, "object");
  assertEquals(client instanceof Client, true);
});

Deno.test("pub/sub should work", async () => {
  const persistence = new Persistence();
  const clientId = "myClient";
  const topic = "/myTopic";
  const publishPacket: Packet = {
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
  let numCalls = 0;

  async function handler(queue: PacketStore) {
    numCalls++;
    await delay(5); // slow handler
    for await (const [id,] of queue) {
      seen.add(id);
    }
  }

  const client = persistence.registerClient(clientId, handler, () => {});

  persistence.subscribe(client, topic, qos);
  assertEquals(
    client.subscriptions.has(topic),
    true,
    "topic is registered as subscription",
  );
  persistence.publish(topic, makePacket(25));
  persistence.publish(topic, makePacket(27));
  persistence.publish(topic, makePacket(undefined));
  persistence.publish("noTopic", makePacket(undefined));
  await delay(10);
  assertEquals(client.outgoing.size, 3);
  assertEquals(client.outgoing.has(1), true);
  assertEquals(seen.size, 3, "received messages");
  assertEquals(numCalls, 1, "handler is called");
});

Deno.test("many packets should work", async () => {
  const persistence = new Persistence();
  const clientId = "myClient";
  const topic = "/myTopic";
  const numMessages = 1000;
  const publishPacket: Packet = {
    type: PacketType.publish,
    id: 1,
    topic,
    payload: payloadAny,
  };

  function makePacket(id: number | undefined) {
    const newPacket = Object.assign({},publishPacket);
    newPacket.id = id;
    return newPacket;
  }
  const seen = new Set();
  let numCalls = 0;

  async function handler(queue: PacketStore) {
    numCalls++;
    for await (const [id,] of queue) {
      assertEquals(seen.has(id),false), "Not seen ID ${id} before";
      seen.add(id)
      queue.delete(id)
    }
  }

  const client = persistence.registerClient(clientId, handler, () => {});

  persistence.subscribe(client, topic, qos);
  assertEquals(
    client.subscriptions.has(topic),
    true,
    "topic is not registered as subscription",
  );
  for (let i=0; i<numMessages; i++){
    persistence.publish(topic, makePacket(i));
    if ((i % 100) === 0){
      await delay(1);
    }
  }
  await delay(10);
  assertEquals(client.outgoing.size, 0);
  assertEquals(seen.size, numMessages, "received all messages");
});

Deno.test("unsubscribe should work", () => {
  const persistence = new Persistence();
  const clientId = "myClient";
  const topic = "/myTopic";
  const publishPacket: Packet = {
    type: PacketType.publish,
    id: 1,
    topic,
    payload: payloadAny,
  };

  const seen = new Set();
  async function callback(queue: PacketStore) {
    for await (const packet of queue) {
      seen.add(packet[0]);
    }
  }

  const client = persistence.registerClient(clientId, callback, () => {});
  persistence.subscribe(client, topic, qos);
  persistence.unsubscribe(client, topic);

  assertEquals(
    client.subscriptions.has(topic),
    false,
    "topic is still registered as subscription after unsubscription",
  );
  persistence.publish(topic, publishPacket);
  assertEquals(client.outgoing.size, 0);
});
