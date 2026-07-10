/**
 * @module
 * Sqlite-backed implementation of the persistent layer wrapper. Handles full multi-client lifecycle,
 * schema initialization, connection routing, and complex transaction pruning.
 */

import type sqlite from "node:sqlite";
import type {
  Client,
  ClientId,
  ClientRegistrationResult,
  Handler,
  IPersistence,
  IStore,
  PublishPacket,
  QoS,
  Topic,
  TopicFilter,
} from "../mod.ts";
import { Trie } from "../deps.ts";
import {
  SqliteClientSessionStore,
  SqliteRetainStore,
  SqliteStore,
} from "./sqliteStore.ts";
import { deleteClientState, initializeDatabase } from "./sqliteDatabase.ts";

const SQLITE_DATABASE_URL = ":memory:";

/** Holds contextual routing parameters for active trie lookups. */
type ClientSubscription = {
  clientId: ClientId;
  qos: QoS;
};

/**
 * An enterprise Sqlite persistent storage implementation managing stateful broker processing boundaries.
 */
export class SqlitePersistence implements IPersistence {
  clientList: Map<ClientId, Client> = new Map();
  retained: SqliteRetainStore;
  private trie: Trie<ClientSubscription>;
  db: sqlite.DatabaseSync;
  sessionStore: SqliteClientSessionStore;

  /**
   * Prepares and loads persistent Sqlite database storage components.
   * @param filename Configuration target string designating path constraints. Defaults to ':memory:'.
   */
  constructor(filename = SQLITE_DATABASE_URL) {
    this.db = initializeDatabase(filename);
    this.trie = new Trie(true);
    this.retained = new SqliteRetainStore(this.db);
    this.sessionStore = new SqliteClientSessionStore(this.db);
  }

  /**
   * Populate the client list
   * and recreate the store objects
   */
  async initialize(): Promise<void> {
    for (const clientId of this.sessionStore.keys()) {
      // create the store objects
      const store = new SqliteStore(this.db, clientId);
      // register them
      const handler = () => {};
      this.clientList.set(clientId, { store, handler });
      // reload subscriptions from storage back into the trie
      for await (const [topicFilter, qos] of store.subscriptions.entries()) {
        this.trie.add(topicFilter, { clientId, qos });
      }
    }
  }

  /**
   * Registers a client connection against database rows.
   * @param clientId Identified user client string.
   * @param handler Message dispatch routing block.
   */
  registerClient(
    clientId: ClientId,
    handler: Handler,
  ): Promise<ClientRegistrationResult> {
    const existingClient = this.clientList.get(clientId);
    const existingSession = !!existingClient;
    const store = existingClient?.store ?? new SqliteStore(this.db, clientId);
    this.clientList.set(clientId, { store, handler });
    return Promise.resolve({ store, existingSession });
  }

  /** Unbinds and clears states associated to the targeted deregistered client session. */
  async deregisterClient(clientId: ClientId): Promise<void> {
    const client = this.clientList.get(clientId);
    if (client) {
      await this.unsubscribeAll(client.store);
      this.clientList.delete(clientId);
    }
    deleteClientState(this.db, clientId);
  }

  /** Connects a subscription boundary path pattern with targeted tracking stores. */
  subscribe(
    store: IStore,
    topicFilter: TopicFilter,
    qos: QoS,
  ): Promise<void> {
    const clientId = store.clientId;
    store.subscriptions.set(topicFilter, qos);
    this.trie.add(topicFilter, { clientId, qos });
    return Promise.resolve();
  }

  /** Disconnects and breaks specific subscription configurations out of active scopes. */
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
   * Publishes messages matching criteria targets while matching trie references.
   * @param topic Concrete targeted topic context.
   * @param packet Structural parameters describing payload properties.
   */
  async publish(topic: Topic, packet: PublishPacket): Promise<void> {
    if (packet.retain) {
      if (!packet.payload?.byteLength) {
        this.retained.delete(packet.topic);
      } else {
        this.retained.set(packet.topic, packet);
      }
    }

    const clients = new Map<ClientId, QoS>();
    for (const { clientId, qos } of this.trie.match(topic)) {
      // if subscriptions overlap then use the highest QoS
      const prevQos = clients.get(clientId);
      if (!prevQos || prevQos < qos) {
        clients.set(clientId, qos);
      }
    }

    for (const [clientId, qos] of clients) {
      const newPacket = structuredClone(packet);
      newPacket.retain = false;
      // subscription QoS is a maximum, not a minimum
      // if the publishers Qos was lower, use that, else use the subscribers
      const newQos = packet.qos || 0;
      newPacket.qos = newQos < qos ? newQos : qos;
      const client = this.clientList.get(clientId);
      if (client) {
        await client.handler(newPacket);
      }
    }
  }

  /**
   * Dispatches matching historical retained states to newly bound client sessions.
   * @param clientId Targeted destination identification token.
   */
  async handleRetained(clientId: ClientId): Promise<void> {
    const client = this.clientList.get(clientId);
    if (!client?.handler) {
      return;
    }
    const store = client?.store;
    if (!store || (await store.subscriptions.size()) === 0) return;

    for await (const topicFilter of store.subscriptions.keys()) {
      for (const retainedPacket of this.retained.matches(topicFilter)) {
        await client.handler(retainedPacket);
      }
    }
  }

  /** Halts, flushes and shuts active internal database connection scopes safely. */
  close(): void {
    this.db.close();
  }
}
