import sqlite from "node:sqlite";
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
} from "./SQLiteStore.ts";

const SQLITE_DATABASE_URL = ":memory:";

type ClientSubscription = {
  clientId: ClientId;
  qos: QoS;
};

function initializeDatabase(filename: string): sqlite.DatabaseSync {
  const db = new sqlite.DatabaseSync(filename);
  db.exec(`
      create table if not exists client_sessions (
        client_id text primary key,
        existing_session integer not null
      );
      create table if not exists subscriptions (
        client_id text not null,
        topic text not null,
        qos integer not null,
        primary key(client_id, topic)
      );
      create table if not exists pending_incoming (
        client_id text not null,
        packet_id integer not null,
        primary key(client_id, packet_id)
      );
      create table if not exists pending_outgoing (
        client_id text not null,
        packet_id integer not null,
        packet text not null,
        payload blob,
        primary key(client_id, packet_id)
      );
      create table if not exists pending_ack_outgoing (
        client_id text not null,
        packet_id integer not null,
        primary key(client_id, packet_id)
      );
      create table if not exists retained (
        topic text primary key,
        packet text not null,
        payload blob
      );
    `);
  return db;
}

function deleteClientState(db: sqlite.DatabaseSync, clientId: ClientId): void {
  db.exec("begin;");
  db.prepare(
    "delete from subscriptions where client_id = ?",
  ).run(clientId);
  db.prepare(
    "delete from pending_incoming where client_id = ?",
  ).run(clientId);
  db.prepare(
    "delete from pending_outgoing where client_id = ?",
  ).run(clientId);
  db.prepare(
    "delete from pending_ack_outgoing where client_id = ?",
  ).run(clientId);
  db.prepare(
    "delete from client_sessions where client_id = ?",
  ).run(clientId);
  db.exec("commit;");
}

export class SQLitePersistence implements IPersistence {
  clientList: Map<ClientId, Client> = new Map();
  retained: SqliteRetainStore;
  private trie: Trie<ClientSubscription>;
  db: sqlite.DatabaseSync;
  sessionStore: SQLiteClientSessionStore;

  constructor(filename = SQLITE_DATABASE_URL) {
    this.db = initializeDatabase(filename);
    this.trie = new Trie(true);
    this.retained = new SqliteRetainStore(this.db);
    this.sessionStore = new SQLiteClientSessionStore(this.db);
  }

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

  deregisterClient(clientId: ClientId): void {
    const client = this.clientList.get(clientId);
    if (client) {
      this.unsubscribeAll(client.store);
      this.clientList.delete(clientId);
    }
    deleteClientState(this.db, clientId);
  }

  subscribe(store: IStore, topicFilter: TopicFilter, qos: QoS): void {
    const clientId = store.clientId;
    if (!store.subscriptions.has(topicFilter)) {
      store.subscriptions.set(topicFilter, qos);
      this.trie.add(topicFilter, { clientId, qos });
    }
  }

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

  close(): void {
    this.db.close();
  }
}
