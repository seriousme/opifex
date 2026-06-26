import sqlite from "node:sqlite";
import type {
  Client,
  ClientId,
  Handler,
  IPersistence,
  IStore,
  PacketId,
  PacketIdStore,
  PacketStore,
  PublishPacket,
  QoS,
  RetainStore,
  SubscriptionStore,
  Topic,
  TopicFilter,
} from "../mod.ts";
import { maxPacketId } from "../mod.ts";
import { Trie } from "../deps.ts";
import { assert } from "../../utils/mod.ts";

const SQLITE_DATABASE_URL = ":memory:";

type SerializedPacket = {
  packet: string;
  payload: Uint8Array | null;
};

type ClientSubscription = {
  clientId: ClientId;
  qos: QoS;
};

function serializePacket(packet: PublishPacket): SerializedPacket {
  const payload = packet.payload?.byteLength
    ? Buffer.from(packet.payload)
    : null;
  const packetData = {
    ...packet,
    payload: undefined,
  };
  return {
    packet: JSON.stringify(packetData),
    payload,
  };
}

function deserializePacket(
  packet: string,
  payload: Uint8Array | null,
): PublishPacket {
  const data = JSON.parse(packet);
  if (payload && payload.byteLength) {
    data.payload = new Uint8Array(payload);
  }
  return data as PublishPacket;
}

class SqlitePacketIdSet extends Set<PacketId> {
  private persistence: SQLitePersistence;
  private clientId: ClientId;
  private tableName: "pending_incoming" | "pending_ack_outgoing";

  constructor(
    persistence: SQLitePersistence,
    clientId: ClientId,
    tableName: "pending_incoming" | "pending_ack_outgoing",
    entries?: Iterable<PacketId>,
  ) {
    super(entries);
    this.persistence = persistence;
    this.clientId = clientId;
    this.tableName = tableName;
  }

  override add(value: PacketId): this {
    const result = super.add(value);
    this.persistence.db.prepare(
      `insert or ignore into ${this.tableName}(client_id, packet_id) values(?, ?)`,
    ).run(this.clientId, value);
    return result;
  }

  override delete(value: PacketId): boolean {
    const deleted = super.delete(value);
    if (deleted) {
      this.persistence.db.prepare(
        `delete from ${this.tableName} where client_id = ? and packet_id = ?`,
      ).run(this.clientId, value);
    }
    return deleted;
  }

  override clear(): void {
    for (const packetId of [...this]) {
      this.delete(packetId);
    }
  }
}

class SqlitePacketStore extends Map<PacketId, PublishPacket> {
  private persistence: SQLitePersistence;
  private clientId: ClientId;

  constructor(
    persistence: SQLitePersistence,
    clientId: ClientId,
    entries?: Iterable<readonly [PacketId, PublishPacket]>,
  ) {
    super(entries);
    this.persistence = persistence;
    this.clientId = clientId;
  }

  override set(key: PacketId, value: PublishPacket): this {
    const result = super.set(key, value);
    const serialized = serializePacket(value);
    this.persistence.db.prepare(
      "insert or replace into pending_outgoing(client_id, packet_id, packet, payload) values(?, ?, ?, ?)",
    ).run(this.clientId, key, serialized.packet, serialized.payload);
    return result;
  }

  override delete(key: PacketId): boolean {
    const deleted = super.delete(key);
    if (deleted) {
      this.persistence.db.prepare(
        "delete from pending_outgoing where client_id = ? and packet_id = ?",
      ).run(this.clientId, key);
    }
    return deleted;
  }

  override clear(): void {
    for (const packetId of [...this.keys()]) {
      this.delete(packetId);
    }
  }
}

class SqliteSubscriptionStore extends Map<Topic, QoS> {
  private persistence: SQLitePersistence;
  private clientId: ClientId;

  constructor(
    persistence: SQLitePersistence,
    clientId: ClientId,
    entries?: Iterable<readonly [Topic, QoS]>,
  ) {
    super(entries);
    this.persistence = persistence;
    this.clientId = clientId;
  }

  override set(key: Topic, value: QoS): this {
    const result = super.set(key, value);
    this.persistence.db.prepare(
      "insert or replace into subscriptions(client_id, topic, qos) values(?, ?, ?)",
    ).run(this.clientId, key, value);
    return result;
  }

  override delete(key: Topic): boolean {
    const deleted = super.delete(key);
    if (deleted) {
      this.persistence.db.prepare(
        "delete from subscriptions where client_id = ? and topic = ?",
      ).run(this.clientId, key);
    }
    return deleted;
  }

  override clear(): void {
    for (const topic of [...this.keys()]) {
      this.delete(topic);
    }
  }
}

export class SQLiteStore implements IStore {
  private _existingSession = false;
  clientId: ClientId;
  pendingIncoming: PacketIdStore;
  pendingOutgoing: PacketStore;
  pendingAckOutgoing: PacketIdStore;
  subscriptions: SubscriptionStore;
  private persistence: SQLitePersistence;

  constructor(
    persistence: SQLitePersistence,
    clientId: ClientId,
    existingSession = false,
    pendingIncoming?: PacketId[],
    pendingOutgoing?: Array<readonly [PacketId, PublishPacket]>,
    pendingAckOutgoing?: PacketId[],
    subscriptions?: Array<readonly [Topic, QoS]>,
  ) {
    this.persistence = persistence;
    this.clientId = clientId;
    this._existingSession = existingSession;
    this.pendingIncoming = new SqlitePacketIdSet(
      persistence,
      clientId,
      "pending_incoming",
      pendingIncoming,
    );
    this.pendingOutgoing = new SqlitePacketStore(
      persistence,
      clientId,
      pendingOutgoing,
    );
    this.pendingAckOutgoing = new SqlitePacketIdSet(
      persistence,
      clientId,
      "pending_ack_outgoing",
      pendingAckOutgoing,
    );
    this.subscriptions = new SqliteSubscriptionStore(
      persistence,
      clientId,
      subscriptions,
    );
  }

  get existingSession(): boolean {
    return this._existingSession;
  }

  set existingSession(value: boolean) {
    if (this._existingSession === value) {
      return;
    }
    this._existingSession = value;
    this.persistence.saveClientSession(this.clientId, value);
  }

  nextId(): PacketId {
    const currentId = this.pendingOutgoing.size > 0
      ? Math.max(...this.pendingOutgoing.keys())
      : 0;
    let packetId = currentId;
    do {
      packetId = (packetId + 1) & maxPacketId;
      if (packetId === 0) packetId = 1;
    } while (
      (this.pendingOutgoing.has(packetId) ||
        this.pendingAckOutgoing.has(packetId)) && packetId !== currentId
    );
    assert(packetId !== currentId, "No unused packetId available");
    return packetId;
  }
}

export class SQLitePersistence implements IPersistence {
  clientList: Map<ClientId, Client> = new Map();
  retained: RetainStore = new Map();
  private trie: Trie<ClientSubscription>;
  db: sqlite.DatabaseSync;

  constructor(filename = SQLITE_DATABASE_URL) {
    this.db = new sqlite.DatabaseSync(filename);
    this.trie = new Trie(true);
    this.initializeDatabase();
    this.loadRetained();
  }

  private initializeDatabase(): void {
    this.db.exec(`
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
  }

  private loadRetained(): void {
    const rows = this.db.prepare(
      "select topic, packet, payload from retained",
    ).all() as Array<
      { topic: Topic | null; packet: string | null; payload: Uint8Array | null }
    >;
    for (const row of rows) {
      if (row.topic && row.packet) {
        this.retained.set(
          row.topic,
          deserializePacket(row.packet, row.payload ?? null),
        );
      }
    }
  }

  private loadStoreFromDb(
    clientId: ClientId,
    _handler: Handler,
  ): SQLiteStore | null {
    const session = this.db.prepare(
      "select existing_session from client_sessions where client_id = ?",
    ).get(clientId);
    if (!session) {
      return null;
    }

    const subscriptions = (this.db.prepare(
      "select topic, qos from subscriptions where client_id = ?",
    ).all(clientId) as Array<{ topic: Topic | null; qos: QoS }>).map((row) =>
      [row.topic as Topic, row.qos] as const
    );

    const pendingIncoming = (this.db.prepare(
      "select packet_id from pending_incoming where client_id = ?",
    ).all(clientId) as Array<{ packet_id: PacketId }>).map((row) =>
      row.packet_id
    );

    const pendingAckOutgoing = (this.db.prepare(
      "select packet_id from pending_ack_outgoing where client_id = ?",
    ).all(clientId) as Array<{ packet_id: PacketId }>).map((row) =>
      row.packet_id
    );

    const pendingOutgoing = (this.db.prepare(
      "select packet_id, packet, payload from pending_outgoing where client_id = ?",
    ).all(clientId) as Array<
      { packet_id: PacketId; packet: string | null; payload: Uint8Array | null }
    >)
      .map((row) =>
        [
          row.packet_id,
          deserializePacket(row.packet as string, row.payload ?? null),
        ] as const
      );

    const store = new SQLiteStore(
      this,
      clientId,
      Boolean(session["existing_session"]),
      pendingIncoming,
      pendingOutgoing,
      pendingAckOutgoing,
      subscriptions,
    );

    for (const [topicFilter, qos] of store.subscriptions) {
      this.trie.add(topicFilter, { clientId, qos });
    }

    return store;
  }

  saveClientSession(clientId: ClientId, existingSession: boolean): void {
    this.db.prepare(
      "insert or replace into client_sessions(client_id, existing_session) values(?, ?)",
    ).run(clientId, existingSession ? 1 : 0);
  }

  deleteClientState(clientId: ClientId): void {
    this.db.exec("begin;");
    this.db.prepare(
      "delete from subscriptions where client_id = ?",
    ).run(clientId);
    this.db.prepare(
      "delete from pending_incoming where client_id = ?",
    ).run(clientId);
    this.db.prepare(
      "delete from pending_outgoing where client_id = ?",
    ).run(clientId);
    this.db.prepare(
      "delete from pending_ack_outgoing where client_id = ?",
    ).run(clientId);
    this.db.prepare(
      "delete from client_sessions where client_id = ?",
    ).run(clientId);
    this.db.exec("commit;");
  }

  registerClient(
    clientId: ClientId,
    handler: Handler,
    clean: boolean,
  ): IStore {
    const existingClient = this.clientList.get(clientId);
    if (!clean && existingClient) {
      this.clientList.set(clientId, { store: existingClient.store, handler });
      return existingClient.store;
    }

    if (clean) {
      this.deleteClientState(clientId);
    }

    let store = !clean ? this.loadStoreFromDb(clientId, handler) : null;
    if (!store) {
      store = new SQLiteStore(this, clientId, false);
      this.saveClientSession(clientId, false);
    }

    this.clientList.set(clientId, { store, handler });
    return store;
  }

  deregisterClient(clientId: ClientId): void {
    const client = this.clientList.get(clientId);
    if (client) {
      this.unsubscribeAll(client.store);
      this.clientList.delete(clientId);
    }
    this.deleteClientState(clientId);
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
        this.db.prepare("delete from retained where topic = ?").run(
          packet.topic,
        );
      } else {
        this.retained.set(packet.topic, packet);
        const serialized = serializePacket(packet);
        this.db.prepare(
          "insert or replace into retained(topic, packet, payload) values(?, ?, ?)",
        ).run(packet.topic, serialized.packet, serialized.payload);
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
    const retainedTrie: Trie<ClientId> = new Trie();
    const client = this.clientList.get(clientId);
    const store = client?.store;
    if (store) {
      for (const [topicFilter] of store.subscriptions) {
        retainedTrie.add(topicFilter, clientId);
      }
      for (const [topic, packet] of this.retained) {
        if (retainedTrie.match(topic).length > 0) {
          client?.handler(packet);
        }
      }
    }
  }

  close(): void {
    this.db.close();
  }
}
