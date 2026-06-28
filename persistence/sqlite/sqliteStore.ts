/**
 * @module
 * SQLite-backed sub-stores managing persistent states for single client sessions,
 * including incoming/outgoing packets, active subscriptions, and retained messages.
 */

import type { DatabaseSync } from "node:sqlite";
import type { PublishPacket } from "../../mqttPacket/publish.ts";
import type {
  ClientId,
  PacketId,
  QoS,
  Topic,
  TopicFilter,
} from "../../mqttPacket/types.ts";
import { MAX_PACKET_ID } from "../persistence.ts";
import type {
  IPacketIdStore,
  IPacketStore,
  IStore,
  ISubscriptionStore,
} from "../store.ts";
import { topicFilterToRegExp } from "../../utils/mod.ts";

/**
 * Represents a packet serialized into a format optimized for database retention.
 */
type SerializedPacket = {
  packet: string;
  payload: Uint8Array | null;
};

/**
 * Parameters used to manage structural MQTT sessions.
 */
type SessionParameters = {
  clientId: ClientId;
  existingSession: boolean;
};

/**
 * Serializes a high-level PublishPacket object into JSON and binary forms for database writing.
 * @param packet The packet instance to process.
 */
function serializePacket(packet: PublishPacket): SerializedPacket {
  const payload = packet.payload?.byteLength ? packet.payload : null;
  const packetData = {
    ...packet,
    payload: undefined,
  };
  return {
    packet: JSON.stringify(packetData),
    payload,
  };
}

/**
 * Deserializes database-retrieved entries back into a fully formed PublishPacket object.
 * @param packet The JSON representation string of the packet properties.
 * @param payload The raw binary content byte array.
 */
function deserializePacket(
  packet: string,
  payload: Uint8Array | null,
): PublishPacket {
  const data = JSON.parse(packet);
  if (payload !== null) {
    data.payload = payload;
  }
  return data as PublishPacket;
}

/**
 * Helper method to cast a standard IterableIterator into a MapIterator
 * by backing it with the correct Symbol properties to satisfy TypeScript.
 * @param rowIterator The basic iterable row cursor from SQLite.
 * @param mapFn Transformation function mapped over individual database rows.
 */
function createMapIterator<TDbRow, TResult>(
  rowIterator: IterableIterator<TDbRow>,
  mapFn: (row: TDbRow) => TResult,
): MapIterator<TResult> {
  const generator = function* () {
    for (const row of rowIterator) {
      yield mapFn(row);
    }
  };

  const iteratorInstance = generator();
  return Object.create(iteratorInstance, {
    [Symbol.toStringTag]: {
      value: "Map Iterator",
      configurable: true,
      enumerable: false,
      writable: true,
    },
    next: {
      value: () => iteratorInstance.next(),
      configurable: true,
      writable: true,
    },
  }) as MapIterator<TResult>;
}

/**
 * A database-backed Packet ID store that records acknowledgement IDs (such as QoS 2 tokens).
 */
export class SqlitePacketIdStore implements IPacketIdStore {
  private db: DatabaseSync;
  private clientId: ClientId;
  private tableName: "pending_incoming" | "pending_ack_outgoing";

  /**
   * Initializes a new instance of SqlitePacketIdStore.
   * @param db The active connection database.
   * @param clientId Identifies the relevant tracking client session.
   * @param tableName Explicit relational table designation mapping destination tracking.
   * @param entries Optional seed entries saved right away.
   */
  constructor(
    db: DatabaseSync,
    clientId: ClientId,
    tableName: "pending_incoming" | "pending_ack_outgoing",
    entries?: Iterable<PacketId>,
  ) {
    this.db = db;
    this.clientId = clientId;
    this.tableName = tableName;
    if (entries) {
      for (const packetId of entries) {
        this.add(packetId);
      }
    }
  }

  /** Inserts a packet identifier under client constraints. */
  add(value: PacketId): this {
    this.db.prepare(
      `insert or ignore into ${this.tableName}(client_id, packet_id) values(?, ?)`,
    ).run(this.clientId, value);
    return this;
  }

  /** Drops tracking allocation target from target row. */
  delete(value: PacketId): boolean {
    const deleted = this.db.prepare(
      `delete from ${this.tableName} where client_id = ? and packet_id = ?`,
    ).run(this.clientId, value).changes > 0;
    return deleted;
  }

  /** Clears all mapped Packet IDs tracking under this client context. */
  clear(): void {
    this.db.prepare(
      `delete from ${this.tableName} where client_id = ?`,
    ).run(this.clientId);
  }

  /** Assesses existence of the requested Packet ID tracking. */
  has(key: PacketId): boolean {
    const row = this.db.prepare(
      `select 1 from ${this.tableName} where client_id = ? and packet_id = ? limit 1`,
    ).get(this.clientId, key);

    return !!row;
  }

  /** Returns active tracking queue length. */
  get size(): number {
    const row = this.db.prepare(
      `select count(*) as count from ${this.tableName} where client_id = ?`,
    ).get(this.clientId) as { count: number };

    return row?.count ?? 0;
  }

  /** Iterates across active assigned Packet IDs. */
  keys(): IterableIterator<PacketId> {
    const rows = this.db.prepare(
      `select packet_id from ${this.tableName} where client_id = ?`,
    ).all(this.clientId) as Array<{ packet_id: PacketId }>;
    return rows.map((r) => r.packet_id)[Symbol.iterator]();
  }
}

/**
 * A database-backed Store that implements the Map interface.
 * It directly persists and retrieves MQTT packets from SQLite
 * without caching them in memory.
 */
export class SqlitePacketStore implements IPacketStore {
  private db: DatabaseSync;
  private clientId: ClientId;

  /**
   * Creates an instance of SqlitePacketStore.
   * @param db The SQLite database instance containing the database connection.
   * @param clientId The unique identifier of the MQTT client.
   * @param entries Optional initial entries to be saved immediately to the database.
   */
  constructor(
    db: DatabaseSync,
    clientId: ClientId,
    entries?: Iterable<readonly [PacketId, PublishPacket]>,
  ) {
    this.db = db;
    this.clientId = clientId;

    if (entries) {
      for (const [key, value] of entries) {
        this.set(key, value);
      }
    }
  }

  /**
   * Gets the total number of pending outgoing packets for this client from the database.
   */
  get size(): number {
    const row = this.db.prepare(
      "select count(*) as count from pending_outgoing where client_id = ?",
    ).get(this.clientId) as { count: number };
    return row?.count ?? 0;
  }

  /**
   * Inserts or replaces a packet in the database.
   * @param key The packet identifier.
   * @param value The publish packet object.
   */
  set(key: PacketId, value: PublishPacket): this {
    const serialized = serializePacket(value);
    this.db.prepare(
      "insert or replace into pending_outgoing(client_id, packet_id, packet, payload) values(?, ?, ?, ?)",
    ).run(this.clientId, key, serialized.packet, serialized.payload);
    return this;
  }

  /**
   * Retrieves a packet from the database by its packet ID.
   * @param key The packet identifier.
   * @returns The deserialized PublishPacket, or undefined if not found.
   */
  get(key: PacketId): PublishPacket | undefined {
    const row = this.db.prepare(
      "select packet, payload from pending_outgoing where client_id = ? and packet_id = ?",
    ).get(this.clientId, key) as
      | { packet: string; payload: Uint8Array | null }
      | undefined;

    if (!row) return undefined;
    return deserializePacket(row.packet, row.payload);
  }

  /**
   * Checks if a packet ID exists in the database for this client.
   * @param key The packet identifier.
   */
  has(key: PacketId): boolean {
    const row = this.db.prepare(
      "select 1 from pending_outgoing where client_id = ? and packet_id = ? limit 1",
    ).get(this.clientId, key);
    return !!row;
  }

  /**
   * Deletes a packet from the database.
   * @param key The packet identifier to remove.
   * @returns True if a row was deleted, false otherwise.
   */
  delete(key: PacketId): boolean {
    const info = this.db.prepare(
      "delete from pending_outgoing where client_id = ? and packet_id = ?",
    ).run(this.clientId, key);
    return info.changes > 0;
  }

  /**
   * Removes all pending outgoing packets for this client from the database.
   */
  clear(): void {
    this.db.prepare(
      "delete from pending_outgoing where client_id = ?",
    ).run(this.clientId);
  }

  /**
   * Returns a MapIterator of all packet IDs for this client.
   */
  keys(): MapIterator<PacketId> {
    const rowIterator = this.db.prepare(
      "select packet_id from pending_outgoing where client_id = ?",
    ).iterate(this.clientId) as IterableIterator<{ packet_id: PacketId }>;

    return createMapIterator(rowIterator, (row) => row.packet_id);
  }

  /**
   * Returns a MapIterator of all deserialized PublishPackets for this client.
   */
  values(): MapIterator<PublishPacket> {
    const rowIterator = this.db.prepare(
      "select packet, payload from pending_outgoing where client_id = ?",
    ).iterate(this.clientId) as IterableIterator<
      { packet: string; payload: Uint8Array | null }
    >;

    return createMapIterator(
      rowIterator,
      (row) => deserializePacket(row.packet, row.payload) as PublishPacket,
    );
  }

  /**
   * Returns a MapIterator of [packetId, PublishPacket] pairs for this client.
   */
  entries(): MapIterator<[PacketId, PublishPacket]> {
    const rowIterator = this.db.prepare(
      "select packet_id, packet, payload from pending_outgoing where client_id = ?",
    ).iterate(this.clientId) as IterableIterator<
      { packet_id: PacketId; packet: string; payload: Uint8Array | null }
    >;

    return createMapIterator(
      rowIterator,
      (row) =>
        [row.packet_id, deserializePacket(row.packet, row.payload)] as [
          PacketId,
          PublishPacket,
        ],
    );
  }

  /**
   * Default iterator implementation that yields entries.
   */
  [Symbol.iterator](): MapIterator<[PacketId, PublishPacket]> {
    return this.entries();
  }

  /** @ignore */
  get [Symbol.toStringTag](): string {
    return "SqlitePacketStore";
  }
}

/**
 * A database-backed Subscription store that tracks active topics and QoS constraints for a client.
 */
class SqliteSubscriptionStore implements ISubscriptionStore {
  private db: DatabaseSync;
  private clientId: ClientId;

  /**
   * Creates an instance of SqliteSubscriptionStore.
   * @param db The SQLite database instance containing the database connection.
   * @param clientId The unique identifier of the MQTT client.
   * @param entries Optional initial entries to be saved immediately to the database.
   */
  constructor(
    db: DatabaseSync,
    clientId: ClientId,
    entries?: Iterable<readonly [TopicFilter, QoS]>,
  ) {
    this.db = db;
    this.clientId = clientId;

    if (entries) {
      for (const [key, value] of entries) {
        this.set(key, value);
      }
    }
  }

  /**
   * Gets the total number of subscriptions for this client from the database.
   */
  get size(): number {
    const row = this.db.prepare(
      "select count(*) as count from subscriptions where client_id = ?",
    ).get(this.clientId) as { count: number };
    return row?.count ?? 0;
  }

  /**
   * Inserts or replaces a subscription filter state in the database.
   * @param key The topic filter identifier.
   * @param value The matched maximum QoS parameter level.
   */
  set(key: TopicFilter, value: QoS): this {
    this.db.prepare(
      "insert or replace into subscriptions(client_id, topic, qos) values(?, ?, ?)",
    ).run(this.clientId, key, value);
    return this;
  }

  /**
   * Retrieves active QoS metadata for a specific subscription filter.
   * @param key The requested filter expression.
   * @returns The QoS level configuration, or undefined if not found.
   */
  get(key: TopicFilter): QoS | undefined {
    const row = this.db.prepare(
      "select qos from subscriptions where client_id = ? and topic = ?",
    ).get(this.clientId, key) as
      | { qos: QoS }
      | undefined;

    if (!row) return undefined;
    return row.qos;
  }

  /**
   * Checks if a topic subscription already exists in the database for this client.
   * @param key The target topic filter pattern.
   */
  has(key: TopicFilter): boolean {
    const row = this.db.prepare(
      "select 1 from subscriptions where client_id = ? and topic = ? limit 1",
    ).get(this.clientId, key);
    return !!row;
  }

  /**
   * Deletes an active subscription from the database.
   * @param key The topic filter pattern to remove.
   * @returns True if a row was deleted, false otherwise.
   */
  delete(key: TopicFilter): boolean {
    const info = this.db.prepare(
      "delete from subscriptions where client_id = ? and topic = ? ",
    ).run(this.clientId, key);
    return info.changes > 0;
  }

  /**
   * Removes all active subscriptions for this client from the database.
   */
  clear(): void {
    this.db.prepare(
      "delete from subscriptions where client_id = ?",
    ).run(this.clientId);
  }

  /**
   * Returns a MapIterator of all topicFilters for this client.
   */
  keys(): MapIterator<TopicFilter> {
    const rowIterator = this.db.prepare(
      "select topic from subscriptions where client_id = ?",
    ).iterate(this.clientId) as IterableIterator<{ topic: TopicFilter }>;

    return createMapIterator(rowIterator, (row) => row.topic);
  }

  /**
   * Returns a MapIterator of all QoS configurations for this client.
   */
  values(): MapIterator<QoS> {
    const rowIterator = this.db.prepare(
      "select qos from subscriptions where client_id = ?",
    ).iterate(this.clientId) as IterableIterator<{ qos: QoS }>;

    return createMapIterator(rowIterator, (row) => row.qos);
  }

  /**
   * Returns a MapIterator of [TopicFilter, QoS] pairs for this client.
   */
  entries(): MapIterator<[TopicFilter, QoS]> {
    const rowIterator = this.db.prepare(
      "select topic, qos from subscriptions where client_id = ?",
    ).iterate(this.clientId) as IterableIterator<
      { topic: TopicFilter; qos: QoS }
    >;

    return createMapIterator(
      rowIterator,
      (row) => [row.topic, row.qos] as [TopicFilter, QoS],
    );
  }

  /**
   * Default iterator implementation that yields entries.
   */
  [Symbol.iterator](): MapIterator<[TopicFilter, QoS]> {
    return this.entries();
  }

  /** @ignore */
  get [Symbol.toStringTag](): string {
    return "SqliteSubscriptionStore";
  }
}

/**
 * Handles persistence boundaries for contextual client sessions metadata tracking.
 */
export class SQLiteClientSessionStore {
  private db: DatabaseSync;

  /**
   * Persists client session data that is not retained in any of the other stores.
   * @param db The SQLite database instance containing the database connection.
   * @param sessionParameters Optional initial entry to be saved immediately to the database.
   */
  constructor(
    db: DatabaseSync,
    sessionParameters?: SessionParameters,
  ) {
    this.db = db;
    if (sessionParameters) {
      this.set(sessionParameters);
    }
  }

  /** Inserts metadata regarding a specific client's persistent connectivity state. */
  set(session: SessionParameters): this {
    this.db.prepare(
      "insert or replace into client_sessions(client_id, existing_session) values(?, ?)",
    ).run(session.clientId, session.existingSession ? 1 : 0);

    return this;
  }

  /** Retrieves structural validation attributes concerning structural active states. */
  get(clientId: ClientId): SessionParameters | null {
    const row = this.db.prepare(
      "select client_id, existing_session from client_sessions where client_id = ?",
    ).get(clientId) as
      | { client_id: ClientId; existing_session: number }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      clientId: row.client_id,
      existingSession: !!row.existing_session,
    };
  }

  /** Deletes tracking configurations mapped to the destination client context. */
  delete(clientId: ClientId): this {
    this.db.prepare(
      "delete from client_sessions where client_id = ?",
    ).run(clientId);
    return this;
  }
}

/**
 * Manages database retention and retrieval of published MQTT messages marked with a retain flag.
 */
export class SqliteRetainStore {
  private db: DatabaseSync;

  /**
   * Persists retained messages.
   * @param db The SQLite database instance containing the database connection.
   * @param entries Optional initial entries to be saved immediately to the database.
   */
  constructor(
    db: DatabaseSync,
    entries?: Iterable<PublishPacket>,
  ) {
    this.db = db;

    if (entries) {
      for (const packet of entries) {
        this.set(packet.topic, packet);
      }
    }
  }

  /** Saves a targeted Retained PublishPacket to the relational table. */
  set(key: Topic, packet: PublishPacket): void {
    const serialized = serializePacket(packet);
    this.db.prepare(
      "insert or replace into retained(topic, packet, payload) values(?, ?, ?)",
    ).run(key, serialized.packet, serialized.payload);
  }

  /** Clears structural references tied to an explicit destination topic. */
  delete(key: Topic): void {
    this.db.prepare("delete from retained where topic = ?").run(key);
  }

  /**
   * Evaluates active retained messages yielding all instances matching the provided filter constraint.
   * Uses optimization boundaries shifting evaluation logic based on presence of MQTT wildcards.
   * @param topicFilter The target matching filter constraint pattern.
   */
  *matches(
    topicFilter: TopicFilter,
  ): Generator<PublishPacket, void, unknown> {
    let hasWildcards = false;

    // Build SQL LIKE pattern and detect wildcards in one optimized scan
    const sqlLike = topicFilter.replace(/\/#|#|\+/g, () => {
      hasWildcards = true;
      return "%";
    });

    // FAST PATH: No wildcards found? Perform a laser-focused exact match query.
    if (!hasWildcards) {
      const statement = this.db.prepare(
        "select topic, packet, payload from retained where topic = ?",
      );

      const rowIterator = statement.iterate(topicFilter) as IterableIterator<{
        topic: string;
        packet: string;
        payload: Uint8Array | null;
      }>;

      for (const row of rowIterator) {
        const packet = deserializePacket(row.packet, row.payload);
        yield packet;
      }
    } else {
      // SLOW PATH: Wildcards are present. Fetch candidate rows via LIKE.
      const statement = this.db.prepare(
        "select topic, packet, payload from retained where topic like ?",
      );

      const rowIterator = statement.iterate(sqlLike) as IterableIterator<{
        topic: string;
        packet: string;
        payload: Uint8Array | null;
      }>;

      // Build the precise MQTT RegExp for strict filtering
      const mqttRegex = topicFilterToRegExp(topicFilter);

      for (const row of rowIterator) {
        if (mqttRegex.test(row.topic)) {
          const packet = deserializePacket(row.packet, row.payload);
          yield packet;
        }
      }
    }
  }
}

/**
 * Core SQLite structural implementation organizing all underlying database relational sub-stores.
 */
export class SQLiteStore implements IStore {
  private lastPacketId = 0;
  private db: DatabaseSync;
  clientId: ClientId;
  pendingIncoming: IPacketIdStore;
  pendingOutgoing: IPacketStore;
  pendingAckOutgoing: IPacketIdStore;
  subscriptions: ISubscriptionStore;

  /**
   * Coordinates internal initialization states of tracking tables under specified client references.
   */
  constructor(
    db: DatabaseSync,
    clientId: ClientId,
    pendingIncoming?: PacketId[],
    pendingOutgoing?: Array<readonly [PacketId, PublishPacket]>,
    pendingAckOutgoing?: PacketId[],
    subscriptions?: Array<readonly [Topic, QoS]>,
  ) {
    this.db = db;
    this.clientId = clientId;
    this.pendingIncoming = new SqlitePacketIdStore(
      db,
      clientId,
      "pending_incoming",
      pendingIncoming,
    );
    this.pendingOutgoing = new SqlitePacketStore(
      db,
      clientId,
      pendingOutgoing,
    );
    this.pendingAckOutgoing = new SqlitePacketIdStore(
      db,
      clientId,
      "pending_ack_outgoing",
      pendingAckOutgoing,
    );
    this.subscriptions = new SqliteSubscriptionStore(
      db,
      clientId,
      subscriptions,
    );
  }

  /**
   * Generates sequential Packet Identifiers backed against persistent parameters.
   * @returns An unassigned valid numerical packet signature token.
   * @throws {Error} When no unused packet signatures can be parsed under active sequences constraints.
   */

  nextId(): PacketId {
    let attempts = 0;
    do {
      // rollover to zero when we hit MAX_PACKET_ID
      this.lastPacketId = (this.lastPacketId % MAX_PACKET_ID) + 1;
      attempts++;

      // check if there any packets inFlight with this ID
      const isBusy = this.db.prepare(`
      SELECT 1 FROM pendingOutgoing WHERE id = ?
      UNION ALL
      SELECT 1 FROM pendingAckOutgoing WHERE id = ?
      LIMIT 1
    `).get(this.lastPacketId, this.lastPacketId);

      if (!isBusy) {
        return this.lastPacketId;
      }
    } while (attempts < MAX_PACKET_ID);

    throw new Error("No unused packetId available");
  }
}
