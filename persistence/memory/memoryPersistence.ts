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

  add(value: PacketId): this {
    this.store.add(value);
    return this;
  }

  delete(value: PacketId): boolean {
    const deleted = this.store.delete(value);
    return deleted;
  }

  clear(): void {
    this.store.clear();
  }

  has(key: PacketId): boolean {
    return this.store.has(key);
  }

  get size(): number {
    return this.store.size;
  }

  keys(): IterableIterator<PacketId> {
    return this.store.keys();
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

  get size(): number {
    return this.store.size;
  }

  set(key: K, value: V): this {
    this.store.set(key, value);
    return this;
  }

  get(key: K): V | undefined {
    return this.store.get(key);
  }

  has(key: K): boolean {
    return this.store.has(key);
  }

  delete(key: K): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  keys(): IterableIterator<K> {
    return this.store.keys();
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
  nextId(): PacketId {
    const currentId = this.packetId;
    do {
      this.packetId++;
      if (this.packetId > MAX_PACKET_ID) {
        this.packetId = 0;
      }
    } while (
      (this.pendingOutgoing.has(this.packetId) ||
        this.pendingAckOutgoing.has(this.packetId)) &&
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
  async registerClient(
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
    return { store, existingSession };
  }

  /**
   * Deregisters a client and cleans up all associated active memory subscriptions.
   * @param clientId The unique identifier of the client to remove.
   */
  deregisterClient(clientId: ClientId): void {
    const client = this.clientList.get(clientId);
    if (client) {
      this.unsubscribeAll(client.store);
      this.clientList.delete(clientId);
    }
  }

  /**
   * Subscribes a client session store to a specific topic filter.
   * @param store The client's active store instance.
   * @param topicFilter The MQTT topic filter pattern (e.g., "sensor/+/temperature").
   * @param qos The maximum Quality of Service level requested.
   */
  subscribe(store: IStore, topicFilter: TopicFilter, qos: QoS): void {
    const clientId = store.clientId;
    if (!store.subscriptions.has(topicFilter)) {
      store.subscriptions.set(topicFilter, qos);
      this.trie.add(topicFilter, { clientId, qos });
    }
  }

  /**
   * Unsubscribes a client session store from a specific topic filter.
   * @param store The client's active store instance.
   * @param topicFilter The MQTT topic filter pattern to remove.
   */
  unsubscribe(store: IStore, topicFilter: TopicFilter): void {
    const clientId = store.clientId;
    const qos = store.subscriptions.get(topicFilter);
    if (qos !== undefined) {
      store.subscriptions.delete(topicFilter);
      this.trie.remove(topicFilter, { clientId, qos });
    }
  }

  private unsubscribeAll(store: IStore) {
    for (const topicFilter of store.subscriptions.keys()) {
      this.unsubscribe(store, topicFilter);
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
        await Promise.resolve(client.handler(newPacket));
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
      for (const topicFilter of store.subscriptions.keys()) {
        retainedTrie.add(topicFilter, clientId);
      }
      for (const topic of this.retained.keys()) {
        if (retainedTrie.match(topic).length > 0) {
          const packet = this.retained.get(topic);
          if (packet !== undefined) {
            await Promise.resolve(client!.handler(packet));
          }
        }
      }
    }
  }
}
