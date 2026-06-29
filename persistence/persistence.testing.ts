/**
 * Shared test suite for IPersistence implementations.
 * Ensures behavioral parity between MemoryPersistence and SqlitePersistence.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { MQTTLevel, PacketType } from "./deps.ts";
import type { PublishPacket } from "./deps.ts";
import type { IPersistence } from "./persistence.ts";
import type { IStore } from "./store.ts";

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

function createReceiver(
  persistence: IPersistence,
  clientId: string,
): { store: IStore; received: PublishPacket[] } {
  const received: PublishPacket[] = [];
  const { store } = persistence.registerClient(
    clientId,
    (pkt) => received.push(pkt),
    false,
  );
  return { store, received };
}

type PersistenceFactory = () => {
  persistence: IPersistence;
  cleanup: () => void;
};

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
      assert.strictEqual(persistence.clientList.size, 0);
      cleanup();
    });

    test("registerClient creates client and returns store", () => {
      const { persistence, cleanup } = factory();
      const { store, existingSession } = persistence.registerClient(
        "client1",
        () => {},
        false,
      );

      assert.strictEqual(persistence.clientList.size, 1);
      assert(persistence.clientList.has("client1"));
      assert.strictEqual(store.clientId, "client1");
      assert.strictEqual(existingSession, false);
      cleanup();
    });

    test("deregisterClient removes client from list", () => {
      const { persistence, cleanup } = factory();
      persistence.registerClient("client1", () => {}, false);
      assert.strictEqual(persistence.clientList.size, 1);

      persistence.deregisterClient("client1");
      assert.strictEqual(persistence.clientList.size, 0);
      cleanup();
    });

    // === Subscription Tests ===

    test("subscribe adds topic to store subscriptions", () => {
      const { persistence, cleanup } = factory();
      const { store } = persistence.registerClient("client1", () => {}, false);

      persistence.subscribe(store, "test/topic", 1);

      assert(store.subscriptions.has("test/topic"));
      assert.strictEqual(store.subscriptions.get("test/topic"), 1);
      cleanup();
    });

    test("unsubscribe removes topic from store subscriptions", () => {
      const { persistence, cleanup } = factory();
      const { store } = persistence.registerClient("client1", () => {}, false);

      persistence.subscribe(store, "test/topic", 1);
      persistence.unsubscribe(store, "test/topic");

      assert(!store.subscriptions.has("test/topic"));
      cleanup();
    });

    test("unsubscribe on non-existent topic is a no-op", () => {
      const { persistence, cleanup } = factory();
      const { store } = persistence.registerClient("client1", () => {}, false);

      // Should not throw
      persistence.unsubscribe(store, "nonexistent/topic");
      assert.strictEqual(store.subscriptions.size, 0);
      cleanup();
    });

    // === Publish/Subscribe Routing ===

    test("publish routes to exact topic subscriber", () => {
      const { persistence, cleanup } = factory();
      const { store, received } = createReceiver(persistence, "client1");

      persistence.subscribe(store, "test/topic", 0);
      persistence.publish("test/topic", createPacket("test/topic", "hello"));

      assert.strictEqual(received.length, 1);
      assert.strictEqual(received[0].topic, "test/topic");
      cleanup();
    });

    test("publish does not route to unsubscribed topics", () => {
      const { persistence, cleanup } = factory();
      const { received } = createReceiver(persistence, "client1");

      persistence.publish("test/topic", createPacket("test/topic", "hello"));

      assert.strictEqual(received.length, 0);
      cleanup();
    });

    test("publish routes to + wildcard subscriber", () => {
      const { persistence, cleanup } = factory();
      const { store, received } = createReceiver(persistence, "client1");

      persistence.subscribe(store, "sensors/+/temp", 0);
      persistence.publish(
        "sensors/room1/temp",
        createPacket("sensors/room1/temp", "22"),
      );
      persistence.publish(
        "sensors/room2/temp",
        createPacket("sensors/room2/temp", "24"),
      );
      persistence.publish(
        "sensors/room1/humidity",
        createPacket("sensors/room1/humidity", "50"),
      );

      assert.strictEqual(received.length, 2);
      cleanup();
    });

    test("publish routes to # wildcard subscriber", () => {
      const { persistence, cleanup } = factory();
      const { store, received } = createReceiver(persistence, "client1");

      persistence.subscribe(store, "sensors/#", 0);
      persistence.publish("sensors/temp", createPacket("sensors/temp", "22"));
      persistence.publish(
        "sensors/room1/temp",
        createPacket("sensors/room1/temp", "24"),
      );
      persistence.publish("other/topic", createPacket("other/topic", "data"));

      assert.strictEqual(received.length, 2);
      cleanup();
    });

    test("publish deduplicates when client matches multiple subscriptions", () => {
      const { persistence, cleanup } = factory();
      const { store, received } = createReceiver(persistence, "client1");

      persistence.subscribe(store, "test/+", 1);
      persistence.subscribe(store, "test/#", 2);
      persistence.subscribe(store, "test/topic", 0);

      persistence.publish("test/topic", createPacket("test/topic", "hello"));

      // Should receive only once with highest QoS
      assert.strictEqual(received.length, 1);
      assert.strictEqual(received[0].qos, 2);
      cleanup();
    });

    test("publish routes to multiple clients", () => {
      const { persistence, cleanup } = factory();
      const { store: store1, received: received1 } = createReceiver(
        persistence,
        "client1",
      );
      const { store: store2, received: received2 } = createReceiver(
        persistence,
        "client2",
      );

      persistence.subscribe(store1, "test/topic", 0);
      persistence.subscribe(store2, "test/topic", 1);

      persistence.publish("test/topic", createPacket("test/topic", "hello"));

      assert.strictEqual(received1.length, 1);
      assert.strictEqual(received2.length, 1);
      assert.strictEqual(received1[0].qos, 0);
      assert.strictEqual(received2[0].qos, 1);
      cleanup();
    });

    // === Retained Messages ===

    test("publish with retain=true and empty payload clears retained", () => {
      const { persistence, cleanup } = factory();

      persistence.publish(
        "test/topic",
        createPacket("test/topic", "retained", { retain: true }),
      );

      const { store: store1, received: received1 } = createReceiver(
        persistence,
        "client1",
      );
      persistence.subscribe(store1, "test/topic", 0);
      persistence.handleRetained("client1");
      assert.strictEqual(received1.length, 1);

      persistence.publish("test/topic", {
        type: PacketType.publish,
        protocolLevel: MQTTLevel.v4,
        topic: "test/topic",
        payload: new Uint8Array(0),
        retain: true,
      });

      const { store: store2, received: received2 } = createReceiver(
        persistence,
        "client2",
      );
      persistence.subscribe(store2, "test/topic", 0);
      persistence.handleRetained("client2");
      assert.strictEqual(received2.length, 0);
      cleanup();
    });

    test("handleRetained sends matching retained messages", () => {
      const { persistence, cleanup } = factory();

      persistence.publish(
        "sensor/temp",
        createPacket("sensor/temp", "22", { retain: true }),
      );
      persistence.publish(
        "sensor/humidity",
        createPacket("sensor/humidity", "50", { retain: true }),
      );
      persistence.publish(
        "other/topic",
        createPacket("other/topic", "data", { retain: true }),
      );

      const { store, received } = createReceiver(persistence, "client1");
      persistence.subscribe(store, "sensor/+", 0);
      persistence.handleRetained("client1");

      assert.strictEqual(received.length, 2);
      cleanup();
    });

    // === Session Persistence ===

    test("clean session discards previous subscriptions", () => {
      const { persistence, cleanup } = factory();

      const { store: store1 } = persistence.registerClient(
        "client1",
        () => {},
        false,
      );
      persistence.subscribe(store1, "test/topic", 1);
      persistence.deregisterClient("client1");

      const { store: store2, existingSession } = persistence.registerClient(
        "client1",
        () => {},
        true,
      );

      assert.strictEqual(existingSession, false);
      assert.strictEqual(store2.subscriptions.size, 0);
      cleanup();
    });

    // === Edge Cases ===

    test("empty topic filter subscription", () => {
      const { persistence, cleanup } = factory();
      const { store } = persistence.registerClient("client1", () => {}, false);

      // Empty topic - should not throw but may not match anything
      persistence.subscribe(store, "", 0);
      assert(store.subscriptions.has(""));
      cleanup();
    });

    test("special characters in topic", () => {
      const { persistence, cleanup } = factory();

      const { store, received } = createReceiver(persistence, "client1");

      const specialTopic = "test/日本語/émoji/🔥";
      persistence.subscribe(store, specialTopic, 0);
      persistence.publish(specialTopic, createPacket(specialTopic, "data"));

      assert.strictEqual(received.length, 1);
      cleanup();
    });

    test("very long topic name", () => {
      const { persistence, cleanup } = factory();
      const { store, received } = createReceiver(persistence, "client1");

      const longTopic = "a/".repeat(100) + "end";
      persistence.subscribe(store, longTopic, 0);
      persistence.publish(longTopic, createPacket(longTopic, "data"));

      assert.strictEqual(received.length, 1);
      cleanup();
    });

    test("many subscriptions per client", () => {
      const { persistence, cleanup } = factory();
      const { store } = persistence.registerClient("client1", () => {}, false);

      for (let i = 0; i < 100; i++) {
        persistence.subscribe(store, `topic/${i}`, i % 3 as 0 | 1 | 2);
      }

      assert.strictEqual(store.subscriptions.size, 100);
      cleanup();
    });

    test("rapid subscribe/unsubscribe cycles", () => {
      const { persistence, cleanup } = factory();
      const { store } = persistence.registerClient("client1", () => {}, false);

      for (let i = 0; i < 50; i++) {
        persistence.subscribe(store, "test/topic", 1);
        persistence.unsubscribe(store, "test/topic");
      }

      assert.strictEqual(store.subscriptions.size, 0);
      cleanup();
    });

    // === Store Tests ===

    test("store.nextId returns incrementing IDs", () => {
      const { persistence, cleanup } = factory();
      const { store } = persistence.registerClient("client1", () => {}, false);

      const id1 = store.nextId();
      const id2 = store.nextId();
      const id3 = store.nextId();

      assert(id1 >= 1 && id1 <= 65535);
      assert(id2 >= 1 && id2 <= 65535);
      assert(id3 >= 1 && id3 <= 65535);
      assert(id1 !== id2 && id2 !== id3);
      cleanup();
    });

    test("store.pendingOutgoing operations", () => {
      const { persistence, cleanup } = factory();
      const { store } = persistence.registerClient("client1", () => {}, false);

      // QoS must be 1 or 2 for pending outgoing (QoS 0 doesn't need persistence)
      const packet = createPacket("test", "data", { id: 1, qos: 1 });
      store.pendingOutgoing.set(1, packet);

      assert(store.pendingOutgoing.has(1));
      assert.deepStrictEqual(store.pendingOutgoing.get(1)?.topic, packet.topic);

      store.pendingOutgoing.delete(1);
      assert(!store.pendingOutgoing.has(1));
      cleanup();
    });

    test("store.pendingIncoming operations", () => {
      const { persistence, cleanup } = factory();
      const { store } = persistence.registerClient("client1", () => {}, false);

      store.pendingIncoming.add(42);
      assert(store.pendingIncoming.has(42));

      store.pendingIncoming.delete(42);
      assert(!store.pendingIncoming.has(42));
      cleanup();
    });

    test("store.pendingAckOutgoing operations", () => {
      const { persistence, cleanup } = factory();
      const { store } = persistence.registerClient("client1", () => {}, false);

      store.pendingAckOutgoing.add(99);
      assert(store.pendingAckOutgoing.has(99));

      store.pendingAckOutgoing.delete(99);
      assert(!store.pendingAckOutgoing.has(99));
      cleanup();
    });
  });


// === Concurrency Tests ===

describe("Concurrency Tests", () => {
  
    test(`${name} - multiple clients publishing simultaneously`, async () => {
      const { persistence, cleanup } = factory();
      const allReceived: PublishPacket[][] = [];

      // Create 10 clients
      const stores: IStore[] = [];
      for (let i = 0; i < 10; i++) {
        const { store, received } = createReceiver(persistence, `client${i}`);
        allReceived.push(received);
        stores.push(store);
        persistence.subscribe(store, "broadcast", 0);
      }

      // Publish 10 messages
      const publishPromises: Promise<void>[] = [];
      for (let i = 0; i < 10; i++) {
        publishPromises.push(
          Promise.resolve().then(() => {
            persistence.publish(
              "broadcast",
              createPacket("broadcast", `msg-${i}`),
            );
          }),
        );
      }

      await Promise.all(publishPromises);

      // Each client should receive all 100 messages
      for (const received of allReceived) {
        assert.strictEqual(received.length, 10);
      }
      cleanup();
    });

    test(`${name} - concurrent subscribe and publish`, async () => {
      const { persistence, cleanup } = factory();
      const { store } = createReceiver(persistence, "client1");

      const operations: Promise<void>[] = [];

      // Interleave subscribes and publishes
      for (let i = 0; i < 20; i++) {
        operations.push(
          Promise.resolve().then(() => {
            persistence.subscribe(store, `topic/${i}`, 0);
          }),
        );
        operations.push(
          Promise.resolve().then(() => {
            persistence.publish(
              `topic/${i}`,
              createPacket(`topic/${i}`, `data${i}`),
            );
          }),
        );
      }

      await Promise.all(operations);

      // Some messages may have been received depending on timing
      // But no errors should occur
      assert(store.subscriptions.size <= 20);
      cleanup();
    });

    test(`${name} - client register/deregister under load`, async () => {
      const { persistence, cleanup } = factory();

      const operations: Promise<void>[] = [];
      for (let cycle = 0; cycle < 5; cycle++) {
        for (let i = 0; i < 10; i++) {
          operations.push(
            Promise.resolve().then(() => {
              const { store } = persistence.registerClient(
                `client-${cycle}-${i}`,
                () => {},
                false,
              );
              persistence.subscribe(store, "test/#", 0);
              persistence.deregisterClient(`client-${cycle}-${i}`);
            }),
          );
        }
      }

      await Promise.all(operations);

      // All clients should be deregistered
      assert.strictEqual(persistence.clientList.size, 0);
      cleanup();
    });
  }
);

// === Packet ID Edge Cases ===

describe("Packet ID Edge Cases", () => {
    test(`${name} - nextId returns IDs in valid range`, () => {
      const { persistence, cleanup } = factory();
      const { store } = persistence.registerClient("client1", () => {}, false);

      // Generate several IDs and verify they're all in valid range
      for (let i = 0; i < 10; i++) {
        const id = store.nextId();
        assert(id >= 1 && id <= 65535, `ID ${id} should be in range 1-65535`);
      }
      cleanup();
    });

    test(`${name} - nextId returns unique IDs when pending stores are empty`, () => {
      const { persistence, cleanup } = factory();
      const { store } = persistence.registerClient("client1", () => {}, false);

      const ids = new Set<number>();
      for (let i = 0; i < 100; i++) {
        const id = store.nextId();
        assert(!ids.has(id), `ID ${id} should be unique`);
        ids.add(id);
      }
      cleanup();
    });

    test(`${name} - nextId skips IDs in pendingAckOutgoing`, () => {
      const { persistence, cleanup } = factory();
      const { store } = persistence.registerClient("client1", () => {}, false);

      const id1 = store.nextId();
      store.pendingAckOutgoing.add(id1);

      const id2 = store.nextId();
      assert.notStrictEqual(id1, id2);
      cleanup();
    });
  }
);

// === Large Payload Tests ===

describe("Large Payload Tests", () => {
    test(`${name} - handles large payloads`, () => {
      const { persistence, cleanup } = factory();
      const { store, received } = createReceiver(persistence, "client1");
      persistence.subscribe(store, "large", 0);

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

      persistence.publish("large", packet);

      assert.strictEqual(received.length, 1);
      assert.strictEqual(received[0].payload?.length, 1024 * 1024);
      cleanup();
    });

    test(`${name} - retained message with large payload`, () => {
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

      persistence.publish("large/retained", packet);

      const { store, received } = createReceiver(
        persistence,
        "client1",
      );
      persistence.subscribe(store, "large/retained", 0);
      persistence.handleRetained("client1");
      assert.strictEqual(received.length, 1);

      assert.strictEqual(received[0]?.payload?.length, 100 * 1024);
      cleanup();
    });
  
});

// === Wildcard Edge Cases ===

describe("Wildcard Edge Cases", () => {
    test(`${name} - # at root matches all topics`, () => {
      const { persistence, cleanup } = factory();
      const { store, received } = createReceiver(persistence, "client1");

      persistence.subscribe(store, "#", 0);

      persistence.publish("a", createPacket("a", "1"));
      persistence.publish("a/b", createPacket("a/b", "2"));
      persistence.publish("a/b/c", createPacket("a/b/c", "3"));

      assert.strictEqual(received.length, 3);
      cleanup();
    });

    test(`${name} - + matches single level including empty`, () => {
      const { persistence, cleanup } = factory();
      const { store, received } = createReceiver(persistence, "client1");

      persistence.subscribe(store, "a/+/c", 0);

      persistence.publish("a/b/c", createPacket("a/b/c", "1"));
      persistence.publish("a//c", createPacket("a//c", "2")); // Empty middle level - still matches

      // Both should match: + matches any single level (including empty string)
      assert.strictEqual(received.length, 2);
      cleanup();
    });

    test(`${name} - multiple # subscriptions from same client`, () => {
      const { persistence, cleanup } = factory();
      const { store, received } = createReceiver(persistence, "client1");

      persistence.subscribe(store, "a/#", 0);
      persistence.subscribe(store, "a/b/#", 1);

      persistence.publish("a/b/c", createPacket("a/b/c", "data"));

      // Should deduplicate and use highest QoS
      assert.strictEqual(received.length, 1);
      assert.strictEqual(received[0].qos, 1);
      cleanup();
    });
  }
);
}
