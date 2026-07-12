/**
 * Shared test suite for IPersistence implementations.
 * Ensures behavioral parity between MemoryPersistence and SqlitePersistence.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { MQTTLevel, PacketType } from "./deps.ts";
import type { PublishPacket, QoS } from "./deps.ts";
import type { IPersistence } from "./persistence.ts";

const utf8Encoder = new TextEncoder();

function createPacket(
  topic: string,
  payload: string,
  options: Partial<PublishPacket> = {},
): PublishPacket {
  return {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    topic,
    payload: utf8Encoder.encode(payload),
    qos: 0,
    ...options,
  };
}

async function createReceiver(
  persistence: IPersistence,
  clientId: string,
  clean = false,
): Promise<{ received: PublishPacket[] }> {
  if (clean) {
    await persistence.deregisterClient(clientId);
  }
  const received: PublishPacket[] = [];
  await persistence.registerClient(
    clientId,
    (pkt) => {
      received.push(pkt);
      return Promise.resolve();
    },
  );
  return { received };
}

export type PersistenceFactoryOptions = {
  name: string;
  factory: () => {
    persistence: IPersistence;
    cleanup: () => void | Promise<void>;
  };
};

export function runPersistenceTestSuite(options: PersistenceFactoryOptions) {
  const { name, factory } = options;
  describe(`${name} - Shared Behavioral Tests`, () => {
    // === Basic Operations ===

    test("initializes with empty client list", () => {
      const { persistence, cleanup } = factory();
      assert.strictEqual(persistence.clientHandlerList.size, 0);
      cleanup();
    });

    test("registerClient creates client", async () => {
      const { persistence, cleanup } = factory();
      const { existingSession } = await persistence.registerClient(
        "client1",
        () => Promise.resolve(),
      );

      assert.strictEqual(persistence.clientHandlerList.size, 1);
      assert(persistence.clientHandlerList.has("client1"));
      assert.strictEqual(existingSession, false);
      cleanup();
    });

    test("deregisterClient removes client from list", async () => {
      const { persistence, cleanup } = factory();
      await persistence.registerClient("client1", () => Promise.resolve());
      assert.strictEqual(persistence.clientHandlerList.size, 1);

      await persistence.deregisterClient("client1");
      assert.strictEqual(persistence.clientHandlerList.size, 0);
      cleanup();
    });

    // === Subscription Tests ===

    test("subscribe adds topic to subscriptions", async () => {
      const { persistence, cleanup } = factory();
      await persistence.registerClient("client1", () => Promise.resolve());

      await persistence.subscribe("client1", "test/topic", 1);

      const subs = await Array.fromAsync(
        persistence.getSubscriptions("client1"),
      );
      const match = subs.find((s) => s.topicFilter === "test/topic");

      assert(match !== undefined);
      assert.strictEqual(match.qos, 1);
      cleanup();
    });

    test("unsubscribe removes topic from subscriptions", async () => {
      const { persistence, cleanup } = factory();
      await persistence.registerClient("client1", () => Promise.resolve());

      await persistence.subscribe("client1", "test/topic", 1);
      await persistence.unsubscribe("client1", "test/topic");

      const subs = await Array.fromAsync(
        persistence.getSubscriptions("client1"),
      );
      const match = subs.find((s) => s.topicFilter === "test/topic");
      assert(match === undefined);
      cleanup();
    });

    test("unsubscribe on non-existent topic is a no-op", async () => {
      const { persistence, cleanup } = factory();
      await persistence.registerClient("client1", () => Promise.resolve());

      // Should not throw
      await persistence.unsubscribe("client1", "nonexistent/topic");
      const subs = await Array.fromAsync(
        persistence.getSubscriptions("client1"),
      );
      assert.strictEqual(subs.length, 0);
      cleanup();
    });

    // === Publish/Subscribe Routing ===

    test("publish routes to exact topic subscriber", async () => {
      const { persistence, cleanup } = factory();
      const { received } = await createReceiver(persistence, "client1");

      await persistence.subscribe("client1", "test/topic", 0);
      await persistence.publish(
        "client1",
        "test/topic",
        createPacket("test/topic", "hello"),
      );

      assert.strictEqual(received.length, 1);
      assert.strictEqual(received[0].topic, "test/topic");
      cleanup();
    });

    test("publish does not route to unsubscribed topics", async () => {
      const { persistence, cleanup } = factory();
      const { received } = await createReceiver(persistence, "client1");

      await persistence.publish(
        "client1",
        "test/topic",
        createPacket("test/topic", "hello"),
      );

      assert.strictEqual(received.length, 0);
      cleanup();
    });

    test("publish routes to + wildcard subscriber", async () => {
      const { persistence, cleanup } = factory();
      const { received } = await createReceiver(persistence, "client1");

      await persistence.subscribe("client1", "sensors/+/temp", 0);
      await persistence.publish(
        "client1",
        "sensors/room1/temp",
        createPacket("sensors/room1/temp", "22"),
      );
      await persistence.publish(
        "client1",
        "sensors/room2/temp",
        createPacket("sensors/room2/temp", "24"),
      );
      await persistence.publish(
        "client1",
        "sensors/room1/humidity",
        createPacket("sensors/room1/humidity", "50"),
      );

      assert.strictEqual(received.length, 2);
      cleanup();
    });

    test("publish routes to # wildcard subscriber", async () => {
      const { persistence, cleanup } = factory();
      const { received } = await createReceiver(persistence, "client1");

      await persistence.subscribe("client1", "sensors/#", 0);
      await persistence.publish(
        "client1",
        "sensors/temp",
        createPacket("sensors/temp", "22"),
      );
      await persistence.publish(
        "client1",
        "sensors/room1/temp",
        createPacket("sensors/room1/temp", "24"),
      );
      await persistence.publish(
        "client1",
        "other/topic",
        createPacket("other/topic", "data"),
      );

      assert.strictEqual(received.length, 2);
      cleanup();
    });

    test("publish deduplicates when client matches multiple subscriptions", async () => {
      const { persistence, cleanup } = factory();
      const { received } = await createReceiver(persistence, "client1");

      await persistence.subscribe("client1", "test/+", 1);
      await persistence.subscribe("client1", "test/#", 2);
      await persistence.subscribe("client1", "test/topic", 0);

      await persistence.publish(
        "client1",
        "test/topic",
        createPacket("test/topic", "hello", { qos: 2 }),
      );

      // Should receive only once with highest QoS
      assert.strictEqual(received.length, 1);
      assert.strictEqual(received[0].qos, 2);
      cleanup();
    });

    test("publish routes to multiple clients", async () => {
      const { persistence, cleanup } = factory();
      const { received: received1 } = await createReceiver(
        persistence,
        "client1",
      );
      const { received: received2 } = await createReceiver(
        persistence,
        "client2",
      );

      await persistence.subscribe("client1", "test/topic", 0);
      await persistence.subscribe("client2", "test/topic", 1);

      await persistence.publish(
        "some-publisher",
        "test/topic",
        createPacket("test/topic", "hello", { qos: 1 }),
      );

      assert.strictEqual(received1.length, 1);
      assert.strictEqual(received2.length, 1);
      assert.strictEqual(received1[0].qos, 0);
      assert.strictEqual(received2[0].qos, 1);
      cleanup();
    });

    // === Retained Messages ===

    test("publish with retain=true and empty payload clears retained", async () => {
      const { persistence, cleanup } = factory();

      await persistence.publish(
        "publisher",
        "test/topic",
        createPacket("test/topic", "retained", { retain: true }),
      );

      const { received: received1 } = await createReceiver(
        persistence,
        "client1",
      );
      await persistence.subscribe("client1", "test/topic", 0);
      await persistence.handleRetained("client1");
      assert.strictEqual(received1.length, 1);

      await persistence.publish("publisher", "test/topic", {
        type: PacketType.publish,
        protocolLevel: MQTTLevel.v4,
        topic: "test/topic",
        payload: new Uint8Array(0),
        retain: true,
      });

      const { received: received2 } = await createReceiver(
        persistence,
        "client2",
      );
      await persistence.subscribe("client2", "test/topic", 0);
      await persistence.handleRetained("client2");
      assert.strictEqual(received2.length, 0);
      cleanup();
    });

    test("handleRetained sends matching retained messages", async () => {
      const { persistence, cleanup } = factory();

      await persistence.publish(
        "publisher",
        "sensor/temp",
        createPacket("sensor/temp", "22", { retain: true }),
      );
      await persistence.publish(
        "publisher",
        "sensor/humidity",
        createPacket("sensor/humidity", "50", { retain: true }),
      );
      await persistence.publish(
        "publisher",
        "other/topic",
        createPacket("other/topic", "data", { retain: true }),
      );

      const { received } = await createReceiver(persistence, "client1");
      await persistence.subscribe("client1", "sensor/+", 0);
      await persistence.handleRetained("client1");

      assert.strictEqual(received.length, 2);
      cleanup();
    });

    // === Session Persistence ===

    test("reconnect without deregistration retains client state", async () => {
      const { persistence, cleanup } = factory();

      const qos0opts = { qos: 0 as QoS, retain: false };

      // QoS 0 packets must not be retained
      const incomingQoS0pkt = createPacket("incoming/data", "data", qos0opts);
      const outgoingQoS0pkt = createPacket("outgoing/data", "data", qos0opts);
      // Qos > 0 must be retained
      const incomingQoS1Pkt = createPacket("incoming/data", "data", {
        qos: 1,
        id: 12,
        retain: false,
      });

      const outgoingQoS2Pkt = createPacket("outgoing/data", "data", {
        qos: 2,
        id: 13,
        retain: false,
      });
      const outgoingAckId = 33;

      await persistence.registerClient("client1", () => Promise.resolve());
      await persistence.subscribe("client1", "test/topic", 1);
      await persistence.addPendingIncomingPacket("client1", incomingQoS0pkt);
      await persistence.addPendingIncomingPacket("client1", incomingQoS1Pkt);
      await persistence.addPendingOutgoingPacket("client1", outgoingQoS0pkt);
      await persistence.addPendingOutgoingPacket("client1", outgoingQoS2Pkt);
      await persistence.addPendingAck("client1", outgoingAckId);

      const { existingSession } = await persistence.registerClient(
        "client1",
        () => Promise.resolve(),
      );

      assert.strictEqual(existingSession, true);
      const subs = await Array.fromAsync(
        persistence.getSubscriptions("client1"),
      );
      assert.strictEqual(subs.length, 1);
      assert.strictEqual(subs[0].topicFilter, "test/topic");
      assert.strictEqual(subs[0].qos, 1);
      const inPkts = await Array.fromAsync(
        persistence.listPendingIncomingPackets("client1"),
      );
      assert.strictEqual(inPkts.length, 1);
      assert.strictEqual(inPkts[0].topic, incomingQoS1Pkt.topic);
      const outPkts = await Array.fromAsync(
        persistence.listPendingOutgoingPackets("client1"),
      );
      assert.strictEqual(outPkts.length, 1);
      assert.strictEqual(outPkts[0].topic, outgoingQoS2Pkt.topic);
      const acks = await Array.fromAsync(
        persistence.listPendingAcks("client1"),
      );
      assert.strictEqual(acks.length, 1);
      assert.strictEqual(acks[0], outgoingAckId);
      cleanup();
    });

    test("client deregistration discards previous subscriptions ", async () => {
      const { persistence, cleanup } = factory();
      const incomingPacket = createPacket("incoming/data", "data", {
        qos: 1,
        id: 12,
        retain: false,
      });
      const outgoingPacket = createPacket("outgoing/data", "data", {
        qos: 2,
        id: 13,
        retain: false,
      });
      const outgoingAckId = 33;
      await persistence.registerClient("client1", () => Promise.resolve());
      await persistence.subscribe("client1", "test/topic", 1);
      await persistence.addPendingIncomingPacket("client1", incomingPacket);
      await persistence.addPendingOutgoingPacket("client1", outgoingPacket);
      await persistence.addPendingAck("client1", outgoingAckId);
      await persistence.deregisterClient("client1");

      const { existingSession } = await persistence.registerClient(
        "client1",
        () => Promise.resolve(),
      );

      assert.strictEqual(existingSession, false);
      const subs = await Array.fromAsync(
        persistence.getSubscriptions("client1"),
      );
      assert.strictEqual(subs.length, 0);
      const inPkts = await Array.fromAsync(
        persistence.listPendingIncomingPackets("client1"),
      );
      assert.strictEqual(inPkts.length, 0);
      const outPkts = await Array.fromAsync(
        persistence.listPendingOutgoingPackets("client1"),
      );
      assert.strictEqual(outPkts.length, 0);
      const acks = await Array.fromAsync(
        persistence.listPendingAcks("client1"),
      );
      assert.strictEqual(acks.length, 0);
      cleanup();
    });

    // === Edge Cases ===

    test("empty topic filter subscription", async () => {
      const { persistence, cleanup } = factory();
      await persistence.registerClient("client1", () => Promise.resolve());

      await persistence.subscribe("client1", "", 0);
      const subs = await Array.fromAsync(
        persistence.getSubscriptions("client1"),
      );
      const match = subs.find((s) => s.topicFilter === "");
      assert(match !== undefined);
      cleanup();
    });

    test("special characters in topic", async () => {
      const { persistence, cleanup } = factory();
      const { received } = await createReceiver(persistence, "client1");

      const specialTopic = "test/日本語/émoji/🔥";
      await persistence.subscribe("client1", specialTopic, 0);
      await persistence.publish(
        "client1",
        specialTopic,
        createPacket(specialTopic, "data"),
      );

      assert.strictEqual(received.length, 1);
      cleanup();
    });

    test("very long topic name", async () => {
      const { persistence, cleanup } = factory();
      const { received } = await createReceiver(persistence, "client1");

      const longTopic = "a/".repeat(100) + "end";
      await persistence.subscribe("client1", longTopic, 0);
      await persistence.publish(
        "client1",
        longTopic,
        createPacket(longTopic, "data"),
      );

      assert.strictEqual(received.length, 1);
      cleanup();
    });

    test("many subscriptions per client", async () => {
      const { persistence, cleanup } = factory();
      await persistence.registerClient("client1", () => Promise.resolve());

      for (let i = 0; i < 100; i++) {
        await persistence.subscribe(
          "client1",
          `topic/${i}`,
          i % 3 as 0 | 1 | 2,
        );
      }

      const subs = await Array.fromAsync(
        persistence.getSubscriptions("client1"),
      );
      assert.strictEqual(subs.length, 100);
      cleanup();
    });

    test("rapid subscribe/unsubscribe cycles", async () => {
      const { persistence, cleanup } = factory();
      await persistence.registerClient("client1", () => Promise.resolve());

      for (let i = 0; i < 50; i++) {
        await persistence.subscribe("client1", "test/topic", 1);
        await persistence.unsubscribe("client1", "test/topic");
      }

      const subs = await Array.fromAsync(
        persistence.getSubscriptions("client1"),
      );
      assert.strictEqual(subs.length, 0);
      cleanup();
    });

    // === Low-Level Packet & Ack Stores (Voorheen IStore functionaliteiten) ===

    test("nextPacketId returns incrementing IDs", async () => {
      const { persistence, cleanup } = factory();
      await persistence.registerClient("client1", () => Promise.resolve());

      const id1 = await persistence.nextPacketId("client1");
      const id2 = await persistence.nextPacketId("client1");
      const id3 = await persistence.nextPacketId("client1");

      assert(id1 >= 1 && id1 <= 65535);
      assert(id2 >= 1 && id2 <= 65535);
      assert(id3 >= 1 && id3 <= 65535);
      assert(id1 !== id2 && id2 !== id3);
      cleanup();
    });

    test("pendingOutgoing operations", async () => {
      const { persistence, cleanup } = factory();
      await persistence.registerClient("client1", () => Promise.resolve());

      const packet = createPacket("test", "data", { id: 1, qos: 1 });
      await persistence.addPendingOutgoingPacket("client1", packet);

      const packets = await Array.fromAsync(
        persistence.listPendingOutgoingPackets("client1"),
      );
      assert.strictEqual(packets.length, 1);
      assert.deepStrictEqual(packets[0].topic, packet.topic);

      const deleted = await persistence.deletePendingOutgoingPacket(
        "client1",
        1,
      );
      assert(deleted);

      const packetsPostDelete = await Array.fromAsync(
        persistence.listPendingOutgoingPackets("client1"),
      );
      assert.strictEqual(packetsPostDelete.length, 0);
      cleanup();
    });

    test("pendingIncoming operations", async () => {
      const { persistence, cleanup } = factory();
      await persistence.registerClient("client1", () => Promise.resolve());

      const packet = createPacket("test", "data", { id: 1, qos: 1 });
      await persistence.addPendingIncomingPacket("client1", packet);

      const packets = await Array.fromAsync(
        persistence.listPendingIncomingPackets("client1"),
      );
      assert.strictEqual(packets.length, 1);
      assert.deepStrictEqual(packets[0].topic, packet.topic);

      const deleted = await persistence.deletePendingIncomingPacket(
        "client1",
        1,
      );
      assert(deleted);

      const packetsPostDelete = await Array.fromAsync(
        persistence.listPendingIncomingPackets("client1"),
      );
      assert.strictEqual(packetsPostDelete.length, 0);
      cleanup();
    });

    test("pendingAckOutgoing operations", async () => {
      const { persistence, cleanup } = factory();
      await persistence.registerClient("client1", () => Promise.resolve());

      await persistence.addPendingAck("client1", 99);
      assert(await persistence.hasPendingAck("client1", 99));

      const acks = await Array.fromAsync(
        persistence.listPendingAcks("client1"),
      );
      assert.deepStrictEqual(acks, [99]);

      const deleted = await persistence.deletePendingAck("client1", 99);
      assert(deleted);
      assert(!(await persistence.hasPendingAck("client1", 99)));
      cleanup();
    });
  });

  // === Concurrency Tests ===

  describe("Concurrency Tests", () => {
    test(`${name} - multiple clients publishing simultaneously`, async () => {
      const { persistence, cleanup } = factory();
      const allReceived: PublishPacket[][] = [];

      // Create 10 clients
      for (let i = 0; i < 10; i++) {
        const { received } = await createReceiver(
          persistence,
          `client${i}`,
        );
        allReceived.push(received);
        await persistence.subscribe(`client${i}`, "broadcast", 0);
      }

      // Publish 10 messages
      const publishPromises: Promise<void>[] = [];
      for (let i = 0; i < 10; i++) {
        publishPromises.push(
          persistence.publish(
            "sender",
            "broadcast",
            createPacket("broadcast", `msg-${i}`),
          ),
        );
      }

      await Promise.all(publishPromises);

      // Each client should receive all 10 messages
      for (const received of allReceived) {
        assert.strictEqual(received.length, 10);
      }
      cleanup();
    });

    test(`${name} - concurrent subscribe and publish`, async () => {
      const { persistence, cleanup } = factory();
      await persistence.registerClient("client1", () => Promise.resolve());

      const operations: Promise<void>[] = [];

      // Interleave subscribes and publishes
      for (let i = 0; i < 20; i++) {
        operations.push(
          persistence.subscribe("client1", `topic/${i}`, 0),
        );
        operations.push(
          persistence.publish(
            "client1",
            `topic/${i}`,
            createPacket(`topic/${i}`, `data${i}`),
          ),
        );
      }

      await Promise.all(operations);

      const subs = await Array.fromAsync(
        persistence.getSubscriptions("client1"),
      );
      assert(subs.length <= 20);
      cleanup();
    });

    test(`${name} - client register/deregister under load`, async () => {
      const { persistence, cleanup } = factory();

      const operations: Promise<void>[] = [];
      for (let cycle = 0; cycle < 5; cycle++) {
        for (let i = 0; i < 10; i++) {
          operations.push(
            (async () => {
              await persistence.registerClient(
                `client-${cycle}-${i}`,
                () => Promise.resolve(),
              );
              await persistence.subscribe(`client-${cycle}-${i}`, "test/#", 0);
              await persistence.deregisterClient(`client-${cycle}-${i}`);
            })(),
          );
        }
      }

      await Promise.all(operations);

      // All active clients should be deregistered
      assert.strictEqual(persistence.clientHandlerList.size, 0);
      cleanup();
    });
  });

  // === Packet ID Edge Cases ===

  describe("Packet ID Edge Cases", () => {
    test(`${name} - nextPacketId returns IDs in valid range`, async () => {
      const { persistence, cleanup } = factory();
      await persistence.registerClient("client1", () => Promise.resolve());

      // Generate several IDs and verify they're all in valid range
      for (let i = 0; i < 10; i++) {
        const id = await persistence.nextPacketId("client1");
        assert(id >= 1 && id <= 65535, `ID ${id} should be in range 1-65535`);
      }
      cleanup();
    });

    test(`${name} - nextPacketId returns unique IDs`, async () => {
      const { persistence, cleanup } = factory();
      await persistence.registerClient("client1", () => Promise.resolve());

      const ids = new Set<number>();
      for (let i = 0; i < 100; i++) {
        const id = await persistence.nextPacketId("client1");
        assert(!ids.has(id), `ID ${id} should be unique`);
        ids.add(id);
      }
      cleanup();
    });

    test(`${name} - nextPacketId skips IDs in pendingAckOutgoing`, async () => {
      const { persistence, cleanup } = factory();
      await persistence.registerClient("client1", () => Promise.resolve());

      // get 2 ids to figure out what the next one will be
      await persistence.nextPacketId("client1");
      const targetSkippedId = await persistence.nextPacketId("client1");

      // 2. Registreer de 'targetSkippedId' kunstmatig in de pending ACK tabel
      await persistence.addPendingAck("client1", targetSkippedId);

      // simulate session reset, the ack should still be there
      await persistence.registerClient("client1", () => Promise.resolve());

      // generate a bunch of idś the target should be skipped
      const generatedIds = new Set<number>();
      for (let i = 0; i < 5; i++) {
        const id = await persistence.nextPacketId("client1");
        generatedIds.add(id);
      }

      assert.strictEqual(
        generatedIds.has(targetSkippedId),
        false,
        `Packet-ID ${targetSkippedId} had overgeslagen moeten worden omdat deze in pendingAckOutgoing staat`,
      );
      cleanup();
    });

    test(`${name} - nextPacketId skips IDs in pendingOutgoingPackets`, async () => {
      const { persistence, cleanup } = factory();
      await persistence.registerClient("client1", () => Promise.resolve());

      // generate an id
      const nextId = await persistence.nextPacketId("client1");

      // put a packet wih this id in the pendingOutgoingPackets queue
      const blockedPacket = createPacket("test/topic", "payload", {
        id: nextId,
        qos: 1,
      });
      await persistence.addPendingOutgoingPacket("client1", blockedPacket);

      // Simulate a client-reconnect which might incorrectly reset the id counter
      await persistence.registerClient("client1", () => Promise.resolve());

      // requiest a new set of id's it should not reuse previous id's
      const generatedIds = new Set<number>();
      for (let i = 0; i < 5; i++) {
        const id = await persistence.nextPacketId("client1");
        generatedIds.add(id);
      }

      assert.strictEqual(
        generatedIds.has(nextId),
        false,
        `Packet-ID ${nextId} should have been sikpped because it is still in pendingOutgoingPackets`,
      );
      cleanup();
    });
  });

  // === Large Payload Tests ===

  describe("Large Payload Tests", () => {
    test(`${name} - handles large payloads`, async () => {
      const { persistence, cleanup } = factory();
      const { received } = await createReceiver(persistence, "client1");
      await persistence.subscribe("client1", "large", 0);

      // 1MB payload
      const largePayload = new Uint8Array(1024 * 1024);
      for (let i = 0; i < largePayload.length; i++) {
        largePayload[i] = i % 256;
      }

      const packet: PublishPacket = {
        type: PacketType.publish,
        protocolLevel: MQTTLevel.v4,
        topic: "large",
        payload: largePayload,
        qos: 0,
      };

      await persistence.publish("sender", "large", packet);

      assert.strictEqual(received.length, 1);
      assert.strictEqual(received[0].payload?.length, 1024 * 1024);
      cleanup();
    });

    test(`${name} - retained message with large payload`, async () => {
      const { persistence, cleanup } = factory();

      const largePayload = new Uint8Array(100 * 1024); // 100KB
      const packet: PublishPacket = {
        type: PacketType.publish,
        protocolLevel: MQTTLevel.v4,
        topic: "large/retained",
        payload: largePayload,
        qos: 0,
        retain: true,
      };

      await persistence.publish("sender", "large/retained", packet);

      const { received } = await createReceiver(
        persistence,
        "client1",
      );
      await persistence.subscribe("client1", "large/retained", 0);
      await persistence.handleRetained("client1");
      assert.strictEqual(received.length, 1);

      assert.strictEqual(received[0]?.payload?.length, 100 * 1024);
      cleanup();
    });
  });

  // === Wildcard Edge Cases ===

  describe("Wildcard Edge Cases", () => {
    test(`${name} - # at root matches all topics`, async () => {
      const { persistence, cleanup } = factory();
      const { received } = await createReceiver(persistence, "client1");

      await persistence.subscribe("client1", "#", 0);

      await persistence.publish("sender", "a", createPacket("a", "1"));
      await persistence.publish("sender", "a/b", createPacket("a/b", "2"));
      await persistence.publish("sender", "a/b/c", createPacket("a/b/c", "3"));

      assert.strictEqual(received.length, 3);
      cleanup();
    });

    test(
      `${name} - # at root does not match $`,
      async () => {
        const { persistence, cleanup } = factory();
        const { received } = await createReceiver(
          persistence,
          "client1",
        );

        await persistence.subscribe("client1", "+/+", 0);
        await persistence.subscribe("client1", "#", 0);

        await persistence.publish("sender", "$topic", createPacket("a", "1"));
        assert.strictEqual(received.length, 0);
        cleanup();
      },
    );

    test(`${name} - + matches single level including empty`, async () => {
      const { persistence, cleanup } = factory();
      const { received } = await createReceiver(persistence, "client1");

      await persistence.subscribe("client1", "a/+/c", 0);

      await persistence.publish("sender", "a/b/c", createPacket("a/b/c", "1"));
      await persistence.publish("sender", "a//c", createPacket("a//c", "2")); // Empty middle level - still matches

      // Both should match: + matches any single level (including empty string)
      assert.strictEqual(received.length, 2);
      cleanup();
    });

    test(`${name} - multiple # subscriptions from same client`, async () => {
      const { persistence, cleanup } = factory();
      const { received } = await createReceiver(persistence, "client1");

      await persistence.subscribe("client1", "a/#", 0);
      await persistence.subscribe("client1", "a/b/#", 1);

      await persistence.publish(
        "sender",
        "a/b/c",
        createPacket("a/b/c", "data", { qos: 1 }),
      );

      // Should deduplicate and use highest QoS
      assert.strictEqual(received.length, 1);
      assert.strictEqual(received[0].qos, 1);
      cleanup();
    });
  });
}
