/**
 * @module
 * SQLite-backed implementation of the persistent layer wrapper. Handles full multi-client lifecycle,
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
  SQLiteClientSessionStore,
  SqliteRetainStore,
  SQLiteStore,
} from "./sqliteStore.ts";
import { deleteClientState, initializeDatabase } from "./sqliteDatabase.ts";

const SQLITE_DATABASE_URL = ":memory:";

/** Holds contextual routing parameters for active trie lookups. */
type ClientSubscription = {
  clientId: ClientId;
  qos: QoS;
};

/**
 * An enterprise SQLite persistent storage implementation managing stateful broker processing boundaries.
 */
export class SQLitePersistence implements IPersistence {
  clientList: Map<ClientId, Client> = new Map();
  retained: SqliteRetainStore;
  private trie: Trie<ClientSubscription>;
  db: sqlite.DatabaseSync;
  sessionStore: SQLiteClientSessionStore;

  /**
   * Prepares and loads persistent SQLite database storage components.
   * @param filename Configuration target string designating path constraints. Defaults to ':memory:'.
   */
  constructor(filename = SQLITE_DATABASE_URL) {
    this.db = initializeDatabase(filename);
    this.trie = new Trie(true);
    this.retained = new SqliteRetainStore(this.db);
    this.sessionStore = new SQLiteClientSessionStore(this.db);
  }

  /**
   * Registers a client connection against database rows, re-hydrating matching state structures if found.
   * @param clientId Identified user client string.
   * @param handler Message dispatch routing block.
   * @param clean Directives dictating clean session processing.
   */
  registerClient(
    clientId: ClientId,
    handler: Handler,
    clean: boolean,
  ): ClientRegistrationResult {
    if (clean) {
      deleteClientState(this.db, clientId);
    }
    const existingSession = !!this.sessionStore.get(clientId);
    const store = new SQLiteStore(this.db, clientId);
    if (!existingSession) {
      this.sessionStore.set({ clientId, existingSession: true });
    }
    if (!clean && existingSession) {
      // reinstate subscriptions
      for (const [topicFilter, qos] of store.subscriptions.entries()) {
        this.trie.add(topicFilter, { clientId, qos });
      }
    }
    this.clientList.set(clientId, { store, handler });
    return { store, existingSession };
  }

  /** Unbinds and clears states associated to the targeted deregistered client session. */
  deregisterClient(clientId: ClientId): void {
    const client = this.clientList.get(clientId);
    if (client) {
      this.unsubscribeAll(client.store);
      this.clientList.delete(clientId);
    }
    deleteClientState(this.db, clientId);
  }

  /** Connects a subscription boundary path pattern with targeted tracking stores. */
  subscribe(store: IStore, topicFilter: TopicFilter, qos: QoS): void {
    const clientId = store.clientId;
    if (!store.subscriptions.has(topicFilter)) {
      store.subscriptions.set(topicFilter, qos);
      this.trie.add(topicFilter, { clientId, qos });
    }
  }

  /** Disconnects and breaks specific subscription configurations out of active scopes. */
  unsubscribe(store: IStore, topicFilter: TopicFilter): void {
    const clientId = store.clientId;
    const qos = store.subscriptions.get(topicFilter);
    if (qos !== undefined) {
      store.subscriptions.delete(topicFilter);
      this.trie.remove(topicFilter, { clientId, qos });
    }
  }

  private unsubscribeAll(store: IStore): void {
    for (const topicFilter of [...store.subscriptions.keys()]) {
      this.unsubscribe(store, topicFilter);
    }
  }

  /**
   * Publishes messages matching criteria targets while matching trie references.
   * @param topic Concrete targeted topic context.
   * @param packet Structural parameters describing payload properties.
   */
  publish(topic: Topic, packet: PublishPacket): void {
    if (packet.retain) {
      if (!packet.payload?.byteLength) {
        this.retained.delete(packet.topic);
      } else {
        this.retained.set(packet.topic, packet);
      }
    }

    const clients = new Map<ClientId, QoS>();
    for (const { clientId, qos } of this.trie.match(topic)) {
      const prevQos = clients.get(clientId);
      if (!prevQos || prevQos < qos) {
        clients.set(clientId, qos);
      }
    }

    for (const [clientId, qos] of clients) {
      const newPacket = structuredClone(packet);
      newPacket.retain = false;
      newPacket.qos = qos;
      const client = this.clientList.get(clientId);
      client?.handler(newPacket);
    }
  }

  /**
   * Dispatches matching historical retained states to newly bound client sessions.
   * @param clientId Targeted destination identification token.
   */
  handleRetained(clientId: ClientId): void {
    const client = this.clientList.get(clientId);
    if (!client?.handler) {
      return;
    }
    const store = client?.store;
    if (!store || store.subscriptions.size === 0) return;

    for (const topicFilter of store.subscriptions.keys()) {
      for (const retainedPacket of this.retained.matches(topicFilter)) {
        client.handler(retainedPacket);
      }
    }
  }

  /** Halts, flushes and shuts active internal database connection scopes safely. */
  close(): void {
    this.db.close();
  }
}
