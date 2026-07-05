/**
 * @module
 * In-memory persistence implementations for MQTT clients, sessions, and subscriptions.
 * Suitable for testing or non-persistent MQTT broker setups.
 */

import type {
  Client,
  ClientId,
  ClientRegistrationResult,
  Handler,
  IPacketIdStore,
  IPacketStore,
  IPersistence,
  IStore,
  ISubscriptionStore,
  PacketId,
  PublishPacket,
  QoS,
  Topic,
  TopicFilter,
} from "../mod.ts";

import { MAX_PACKET_ID } from "../mod.ts";

import { Trie } from "../deps.ts";
import { assert } from "../../utils/mod.ts";

/**
 * Represents a subscription mapped to a specific client with its QoS level.
 */
type ClientSubscription = {
  clientId: ClientId;
  qos: QoS;
};

/**
 * An in-memory Packet ID store that records acknowledgement IDs (such as QoS 2 tokens).
 */

export class MemoryPacketIdStore implements IPacketIdStore {
  private store: Set<PacketId>;

  constructor() {
    this.store = new Set();
  }

  add(value: PacketId): Promise<this> {
    this.store.add(value);
    return Promise.resolve(this);
  }

  delete(value: PacketId): Promise<boolean> {
    const deleted = this.store.delete(value);
    return Promise.resolve(deleted);
  }

  clear(): Promise<void> {
    this.store.clear();
    return Promise.resolve();
  }

  has(key: PacketId): Promise<boolean> {
    return Promise.resolve(this.store.has(key));
  }

  size(): Promise<number> {
    return Promise.resolve(this.store.size);
  }

  async *keys(): AsyncIterableIterator<PacketId> {
    for (const key of this.store.keys()) {
      yield key;
    }
  }
}

/**
 * A memory backed Store that persists and retrieves key value pairs
 * to be used to create the other stores
 */

class MemoryBaseStore<K, V> {
  store: Map<K, V>;

  constructor() {
    this.store = new Map();
  }

  set(key: K, value: V): this {
    this.store.set(key, value);
    return this;
  }
  size(): Promise<number> {
    return Promise.resolve(this.store.size);
  }

  get(key: K): Promise<V | undefined> {
    return Promise.resolve(this.store.get(key));
  }

  has(key: K): Promise<boolean> {
    return Promise.resolve(this.store.has(key));
  }

  delete(key: K): Promise<boolean> {
    return Promise.resolve(this.store.delete(key));
  }

  clear(): Promise<void> {
    this.store.clear();
    return Promise.resolve();
  }

  async *keys(): AsyncIterableIterator<K> {
    for (const key of this.store.keys()) {
      yield key;
    }
  }

  async *values(): AsyncIterableIterator<V> {
    for (const value of this.store.values()) {
      yield value;
    }
  }
}

export class MemoryPacketStore
  extends MemoryBaseStore<PacketId, PublishPacket> {}
export class MemoryRetainStore extends MemoryBaseStore<Topic, PublishPacket> {}
export class MemorySubscriptionStore
  extends MemoryBaseStore<TopicFilter, QoS> {}
/**
 * An in-memory store implementation managing packet tracking and subscriptions for a single MQTT client.
 */
export class MemoryStore implements IStore {
  existingSession: boolean = false;
  clientId: ClientId;
  private packetId: PacketId;
  pendingIncoming: IPacketIdStore;
  pendingOutgoing: IPacketStore;
  pendingAckOutgoing: IPacketIdStore;
  subscriptions: ISubscriptionStore;

  /**
   * Creates a new instance of MemoryStore.
   * @param clientId The unique identifier of the MQTT client.
   */
  constructor(clientId: ClientId) {
    this.packetId = 0;
    this.pendingIncoming = new MemoryPacketIdStore();
    this.pendingOutgoing = new MemoryPacketStore();
    this.pendingAckOutgoing = new MemoryPacketIdStore();
    this.subscriptions = new MemorySubscriptionStore();
    this.clientId = clientId;
  }

  /**
   * Generates the next available Packet Identifier for this client session.
   * Ensures the generated ID is not currently in use by pending packets.
   * @returns A valid unassigned Packet ID.
   * @throws {Error} If no unused packet IDs are available.
   */
  async nextId(): Promise<PacketId> {
    const currentId = this.packetId;
    do {
      this.packetId++;
      if (this.packetId > MAX_PACKET_ID) {
        this.packetId = 0;
      }
    } while (
      ((await this.pendingOutgoing.has(this.packetId)) ||
        (await this.pendingAckOutgoing.has(this.packetId))) &&
      this.packetId !== currentId
    );
    assert(this.packetId !== currentId, "No unused packetId available");
    return this.packetId;
  }
}

/**
 * An in-memory persistence layer that coordinates all client sessions, subscriptions, and retained messages.
 */
export class MemoryPersistence implements IPersistence {
  clientList: Map<ClientId, Client>;
  retained: MemoryRetainStore;
  private trie: Trie<ClientSubscription>;

  /**
   * Initializes a new clean instance of MemoryPersistence.
   */
  constructor() {
    this.clientList = new Map();
    this.retained = new MemoryRetainStore();
    this.trie = new Trie(true);
  }

  /**
   * Registers or reinstates an MQTT client session within the memory persistence.
   * @param clientId The unique identifier of the client.
   * @param handler The message handler function used to route packets back to the client.
   * @param clean Whether the client requested a clean session (wiping previous state).
   * @returns An object containing the assigned store and a flag indicating if a session already existed.
   */
  registerClient(
    clientId: ClientId,
    handler: Handler,
    clean: boolean,
  ): Promise<ClientRegistrationResult> {
    if (clean) {
      this.clientList.delete(clientId);
    }
    const existingClient = this.clientList.get(clientId);
    const existingSession = !!existingClient;
    const store = !clean && existingClient
      ? existingClient.store
      : new MemoryStore(clientId);
    this.clientList.set(clientId, { store, handler });
    return Promise.resolve({ store, existingSession });
  }

  /**
   * Deregisters a client and cleans up all associated active memory subscriptions.
   * @param clientId The unique identifier of the client to remove.
   */
  async deregisterClient(clientId: ClientId): Promise<void> {
    const client = this.clientList.get(clientId);
    if (client) {
      await this.unsubscribeAll(client.store);
      this.clientList.delete(clientId);
    }
  }

  /**
   * Subscribes a client session store to a specific topic filter.
   * @param store The client's active store instance.
   * @param topicFilter The MQTT topic filter pattern (e.g., "sensor/+/temperature").
   * @param qos The maximum Quality of Service level requested.
   */
  async subscribe(
    store: IStore,
    topicFilter: TopicFilter,
    qos: QoS,
  ): Promise<void> {
    const clientId = store.clientId;
    if (!await store.subscriptions.has(topicFilter)) {
      store.subscriptions.set(topicFilter, qos);
      this.trie.add(topicFilter, { clientId, qos });
    }
  }

  /**
   * Unsubscribes a client session store from a specific topic filter.
   * @param store The client's active store instance.
   * @param topicFilter The MQTT topic filter pattern to remove.
   */
  async unsubscribe(store: IStore, topicFilter: TopicFilter): Promise<void> {
    const clientId = store.clientId;
    const qos = await store.subscriptions.get(topicFilter);
    if (qos !== undefined) {
      await store.subscriptions.delete(topicFilter);
      this.trie.remove(topicFilter, { clientId, qos });
    }
  }

  private async unsubscribeAll(store: IStore): Promise<void> {
    for await (const topicFilter of store.subscriptions.keys()) {
      await this.unsubscribe(store, topicFilter);
    }
  }

  /**
   * Publishes an incoming packet to all matching subscribers, handling message retention if specified.
   * @param topic The concrete topic name on which the packet was published.
   * @param packet The publish packet data structure.
   */
  async publish(topic: Topic, packet: PublishPacket): Promise<void> {
    if (packet.retain) {
      this.retained.set(packet.topic, packet);
      if (!packet.payload?.byteLength) {
        this.retained.delete(packet.topic);
      }
    }

    // dedup clients
    const clients = new Map();
    for (const { clientId, qos } of this.trie.match(topic)) {
      const prevQos = clients.get(clientId);
      if (!prevQos || prevQos < qos) {
        clients.set(clientId, qos);
      }
    }

    // publish the message to all clients
    for (const [clientId, qos] of clients) {
      const newPacket = structuredClone(packet);
      newPacket.retain = false;
      newPacket.qos = qos;
      //  logger.debug(`publish ${topic} to client ${clientId}`);
      const client = this.clientList.get(clientId);
      if (client) {
        await client.handler(newPacket);
      }
    }
  }

  /**
   * Matches and delivers all active retained messages that match the client's current subscriptions.
   * @param clientId The identifier of the client that needs historical retained messages.
   */
  async handleRetained(clientId: ClientId): Promise<void> {
    const retainedTrie: Trie<ClientId> = new Trie();
    const client = this.clientList.get(clientId);
    const store = client?.store;
    if (store) {
      for await (const topicFilter of store.subscriptions.keys()) {
        retainedTrie.add(topicFilter, clientId);
      }
      for await (const topic of this.retained.keys()) {
        if (retainedTrie.match(topic).length > 0) {
          const packet = await this.retained.get(topic);
          if (packet !== undefined) {
            await client.handler(packet);
          }
        }
      }
    }
  }
}
