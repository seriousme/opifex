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
    for await (const packet of queue) {
      seen.add(packet[0]);
    }
  }

  const client = persistence.registerClient(clientId, handler, () => {});

  persistence.subscribe(client, topic, qos);
  assertEquals(
    client.subscriptions.has(topic),
    true,
    "topic is not registered as subscription",
  );
  persistence.publish(topic, makePacket(25));
  persistence.publish(topic, makePacket(27));
  persistence.publish(topic, makePacket(undefined));
  persistence.publish("noTopic", makePacket(undefined));
  await delay(10);
  // console.log("Outgoing", JSON.stringify(Array.from(client.outgoing), null, 2));
  // console.log("Seen", JSON.stringify(Array.from(seen), null, 2));
  assertEquals(client.outgoing.size, 3);
  assertEquals(client.outgoing.has(1), true);
  assertEquals(seen.size, 3, "received messages");
  assertEquals(numCalls, 1, "handler is called");
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
