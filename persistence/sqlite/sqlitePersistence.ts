/**
 * @module
 * SQLite-backed persistence implementation for MQTT clients, sessions, and subscriptions.
 * Suitable for persistent production or testing environments using node:sqlite.
 */
import type sqlite from "node:sqlite";
import type {
  ClientId,
  ClientRegistrationResult,
  Handler,
  IPersistence,
  PacketId,
  PublishPacket,
  QoS,
  Topic,
  TopicFilter,
} from "../mod.ts";

import { MAX_PACKET_ID } from "../mod.ts";
import { assert, topicFilterToRegExp, Trie } from "../deps.ts";
import { deleteClientState, initializeDatabase } from "./sqliteDatabase.ts";

const SQLITE_DATABASE_URL = ":memory:";

/**
 * Represents a subscription mapped to a specific client with its QoS level.
 */
export type ClientSubscription = {
  clientId: ClientId;
  qos: QoS;
};

/**
 * Serializes a PublishPacket into a database-friendly structure.
 * Isolates payload Uint8Array conversion and JSON stringification for future upgrades.
 */
function serializePacket(
  packet: PublishPacket,
): { packetJson: string; payloadBlob: Uint8Array | null } {
  const packetJson = JSON.stringify({ ...packet, payload: undefined });
  const payloadBlob = packet.payload ? packet.payload : null;
  return { packetJson, payloadBlob };
}

/**
 * Deserializes database records back into a fully formed PublishPacket instance.
 */
function deserializePacket(
  packetJson: string,
  payloadBlob: Uint8Array | null,
): PublishPacket {
  const packet = JSON.parse(packetJson) as PublishPacket;
  if (payloadBlob) {
    packet.payload = payloadBlob;
  }
  return packet;
}

export class SqlitePersistence implements IPersistence {
  // active network connections
  public clientHandlerList = new Map<ClientId, Handler>();

  private db: sqlite.DatabaseSync;

  // In-memory Trie to retain fast MQTT topic matching performance
  private trie = new Trie<ClientSubscription>();
  // In-memory Packet ID generator per client
  private packetIdCounters = new Map<ClientId, number>();

  constructor(db: string | sqlite.DatabaseSync = SQLITE_DATABASE_URL) {
    if (typeof db === "string") {
      this.db = initializeDatabase(db);
    } else {
      this.db = db; // Gebruik de al geïnitialiseerde test-database
    }
    this.rebuildTrie();
  }

  initialize(): Promise<void> {
    // Database is already initialized via the constructor and initializeDatabase
    return Promise.resolve();
  }

  /**
   * Convenience method combining instance creation and initialization.
   */
  static async start(
    db: string | sqlite.DatabaseSync = SQLITE_DATABASE_URL,
  ): Promise<SqlitePersistence> {
    const persistence = new SqlitePersistence(db);
    await persistence.initialize();
    return persistence;
  }

  /**
   * Rebuilds the in-memory Trie from the database on startup.
   */
  private rebuildTrie(): void {
    const stmt = this.db.prepare(
      "select client_id, topic, qos from subscriptions",
    );
    for (
      const row of stmt.iterate() as IterableIterator<
        { client_id: string; topic: string; qos: number }
      >
    ) {
      this.trie.add(row.topic, {
        clientId: row.client_id,
        qos: row.qos as QoS,
      });
    }
  }

  registerClient(
    clientId: ClientId,
    handler: Handler,
  ): Promise<ClientRegistrationResult> {
    this.clientHandlerList.set(clientId, handler);

    const stmt = this.db.prepare(
      "select existing_session from client_sessions where client_id = ?",
    );
    const row = stmt.get(clientId) as { existing_session: number } | undefined;

    if (row) {
      this.db.prepare(
        "update client_sessions set existing_session = 1 where client_id = ?",
      ).run(clientId);
      return Promise.resolve({ existingSession: true });
    }

    // Begin transaction for clean registration of a new client
    this.db.exec("begin;");
    try {
      this.db.prepare(
        "insert into client_sessions (client_id, existing_session) values (?, 0)",
      ).run(clientId);
      this.db.exec("commit;");
    } catch (err) {
      this.db.exec("rollback;");
      throw err;
    }

    return Promise.resolve({ existingSession: false });
  }

  async deregisterClient(clientId: ClientId): Promise<void> {
    this.clientHandlerList.delete(clientId);

    // Explicitly remove subscriptions from the in-memory trie first
    for await (const { topicFilter } of this.getSubscriptions(clientId)) {
      const stmt = this.db.prepare(
        "select qos from subscriptions where client_id = ? and topic = ?",
      );
      const row = stmt.get(clientId, topicFilter) as
        | { qos: number }
        | undefined;
      if (row) {
        this.trie.remove(topicFilter, { clientId, qos: row.qos as QoS });
      }
    }

    // Purge all related relational records via the sqliteDatabase.ts helper
    deleteClientState(this.db, clientId);

    return Promise.resolve();
  }

  // --- Subscriptions ---
  subscribe(
    clientId: ClientId,
    topicFilter: TopicFilter,
    qos: QoS,
  ): Promise<void> {
    // Perform an SQL upsert
    this.db.prepare(`
      insert into subscriptions (client_id, topic, qos) 
      values (?, ?, ?)
      on conflict(client_id, topic) do update set qos = excluded.qos
    `).run(clientId, topicFilter, qos);

    // Sync changes to the in-memory trie (clear older matching variants to avoid duplication)
    this.trie.remove(topicFilter, { clientId, qos: 0 });
    this.trie.remove(topicFilter, { clientId, qos: 1 });
    this.trie.remove(topicFilter, { clientId, qos: 2 });
    this.trie.add(topicFilter, { clientId, qos });

    return Promise.resolve();
  }

  unsubscribe(clientId: ClientId, topicFilter: TopicFilter): Promise<void> {
    const stmt = this.db.prepare(
      "select qos from subscriptions where client_id = ? and topic = ?",
    );
    const row = stmt.get(clientId, topicFilter) as { qos: number } | undefined;

    if (row) {
      this.trie.remove(topicFilter, { clientId, qos: row.qos as QoS });
      this.db.prepare(
        "delete from subscriptions where client_id = ? and topic = ?",
      ).run(clientId, topicFilter);
    }

    return Promise.resolve();
  }

  async *getSubscriptions(
    clientId: ClientId,
  ): AsyncIterableIterator<{ topicFilter: TopicFilter; qos: QoS }> {
    const stmt = this.db.prepare(
      "select topic, qos from subscriptions where client_id = ?",
    );

    for (
      const row of stmt.iterate(clientId) as IterableIterator<
        { topic: string; qos: number }
      >
    ) {
      yield { topicFilter: row.topic, qos: row.qos as QoS };
    }
  }

  // --- Packet Management Incoming ---
  addPendingIncomingPacket(
    clientId: ClientId,
    packet: PublishPacket,
  ): Promise<void> {
    if (packet.id !== undefined) {
      const { packetJson, payloadBlob } = serializePacket(packet);

      this.db.prepare(`
        insert into pending_incoming (client_id, packet_id, packet, payload)
        values (?, ?, ?, ?)
        on conflict(client_id, packet_id) do update set packet = excluded.packet, payload = excluded.payload
      `).run(clientId, packet.id, packetJson, payloadBlob);
    }
    return Promise.resolve();
  }

  getPendingIncomingPacket(
    clientId: ClientId,
    packetId: PacketId,
  ): Promise<PublishPacket | null> {
    const stmt = this.db.prepare(
      "select packet, payload from pending_incoming where client_id = ? and packet_id = ?",
    );

    const row = stmt.get(clientId, packetId) as
      | { packet: string; payload: Uint8Array | null }
      | undefined;

    if (!row) {
      return Promise.resolve(null);
    }

    return Promise.resolve(deserializePacket(row.packet, row.payload));
  }

  async *listPendingIncomingPackets(
    clientId: ClientId,
  ): AsyncIterableIterator<PublishPacket> {
    const stmt = this.db.prepare(
      "select packet, payload from pending_incoming where client_id = ?",
    );

    for (
      const row of stmt.iterate(clientId) as IterableIterator<
        { packet: string; payload: Uint8Array | null }
      >
    ) {
      yield deserializePacket(row.packet, row.payload);
    }
  }

  deletePendingIncomingPacket(
    clientId: ClientId,
    packetId: PacketId,
  ): Promise<boolean> {
    const info = this.db.prepare(
      "delete from pending_incoming where client_id = ? and packet_id = ?",
    ).run(clientId, packetId);
    return Promise.resolve(info.changes > 0);
  }

  // --- Packet Management Outgoing ---
  addPendingOutgoingPacket(
    clientId: ClientId,
    packet: PublishPacket,
  ): Promise<void> {
    if (packet.id !== undefined) {
      const { packetJson, payloadBlob } = serializePacket(packet);

      this.db.prepare(`
        insert into pending_outgoing (client_id, packet_id, packet, payload)
        values (?, ?, ?, ?)
        on conflict(client_id, packet_id) do update set packet = excluded.packet, payload = excluded.payload
      `).run(clientId, packet.id, packetJson, payloadBlob);
    }
    return Promise.resolve();
  }

  async *listPendingOutgoingPackets(
    clientId: ClientId,
  ): AsyncIterableIterator<PublishPacket> {
    const stmt = this.db.prepare(
      "select packet, payload from pending_outgoing where client_id = ?",
    );

    for (
      const row of stmt.iterate(clientId) as IterableIterator<
        { packet: string; payload: Uint8Array | null }
      >
    ) {
      yield deserializePacket(row.packet, row.payload);
    }
  }

  deletePendingOutgoingPacket(
    clientId: ClientId,
    packetId: PacketId,
  ): Promise<boolean> {
    const info = this.db.prepare(
      "delete from pending_outgoing where client_id = ? and packet_id = ?",
    ).run(clientId, packetId);
    return Promise.resolve(info.changes > 0);
  }

  // --- ACKs ---
  addPendingAck(clientId: ClientId, packetId: PacketId): Promise<void> {
    this.db.prepare(`
      insert into pending_ack_outgoing (client_id, packet_id)
      values (?, ?)
      on conflict(client_id, packet_id) do nothing
    `).run(clientId, packetId);
    return Promise.resolve();
  }

  hasPendingAck(clientId: ClientId, packetId: PacketId): Promise<boolean> {
    const stmt = this.db.prepare(
      "select 1 from pending_ack_outgoing where client_id = ? and packet_id = ?",
    );
    const row = stmt.get(clientId, packetId);
    return Promise.resolve(row !== undefined);
  }

  async *listPendingAcks(
    clientId: ClientId,
  ): AsyncIterableIterator<PacketId> {
    const stmt = this.db.prepare(
      "select packet_id from pending_ack_outgoing where client_id = ?",
    );

    for (
      const row of stmt.iterate(clientId) as IterableIterator<
        { packet_id: number }
      >
    ) {
      yield row.packet_id as PacketId;
    }
  }

  deletePendingAck(clientId: ClientId, packetId: PacketId): Promise<boolean> {
    const info = this.db.prepare(
      "delete from pending_ack_outgoing where client_id = ? and packet_id = ?",
    ).run(clientId, packetId);
    return Promise.resolve(info.changes > 0);
  }

  /**
   * Generates the next available Packet Identifier for the client's session.
   * Ensures the generated ID is not currently in use by pending packets.
   */
  nextPacketId(clientId: ClientId): Promise<PacketId> {
    const outStmt = this.db.prepare(
      "select 1 from pending_outgoing where client_id = ? and packet_id = ?",
    );
    const ackStmt = this.db.prepare(
      "select 1 from pending_ack_outgoing where client_id = ? and packet_id = ?",
    );

    const currentId = this.packetIdCounters.get(clientId) || 0;
    let nextId = currentId;
    let attempts = 0;

    do {
      nextId++;
      if (nextId > MAX_PACKET_ID) {
        nextId = 0;
      }
      attempts++;

      const hasOutgoing = outStmt.get(clientId, nextId) !== undefined;
      const hasAck = ackStmt.get(clientId, nextId) !== undefined;

      if (!hasOutgoing && !hasAck) {
        this.packetIdCounters.set(clientId, nextId);
        return Promise.resolve(nextId as PacketId);
      }
    } while (nextId !== currentId);
    assert(false, "No unused packetId available");
  }

  // --- Business Logic (Publish & Retained) ---
  async publish(
    _clientId: ClientId,
    topic: Topic,
    packet: PublishPacket,
  ): Promise<void> {
    if (packet.retain) {
      if (!packet.payload?.byteLength) {
        this.db.prepare("delete from retained where topic = ?").run(
          packet.topic,
        );
      } else {
        const { packetJson, payloadBlob } = serializePacket(packet);

        this.db.prepare(`
          insert into retained (topic, packet, payload)
          values (?, ?, ?)
          on conflict(topic) do update set packet = excluded.packet, payload = excluded.payload
         `).run(topic, packetJson, payloadBlob);
      }
    }

    // Deduplicate target clients using the fast in-memory trie matching
    const clients = new Map<ClientId, QoS>();
    for (const { clientId, qos } of this.trie.match(topic)) {
      const prevQos = clients.get(clientId);
      if (!prevQos || prevQos < qos) {
        clients.set(clientId, qos);
      }
    }

    // Publish the message payload to all currently active online handlers
    for (const [clientId, qos] of clients) {
      const newPacket = structuredClone(packet);
      newPacket.retain = false;

      const newQos = packet.qos || 0;
      newPacket.qos = newQos < qos ? newQos : qos;
      await this.dispatch(clientId, newPacket);
    }
  }

  /**
   * Processes -outbound- publication requests, allocating package IDs and storing
   * unacknowledged QoS > 0 packets into the database.
   * handler(packet) is not awaited on purpose so dispatches run parallel
   * if a dispatch fails that is no problem as we have already stored the packet if qos>0
   */
  async dispatch(clientId: ClientId, packet: PublishPacket): Promise<void> {
    const handler = this.clientHandlerList.get(clientId);
    const qos = packet.qos || 0;
    if (qos === 0) {
      packet.id = 0;
      if (handler) {
        handler(packet);
      }
      return;
    }

    packet.id = await this.nextPacketId(clientId);
    this.addPendingOutgoingPacket(clientId, packet);
    if (handler) {
      handler(packet);
    }
  }

  /**
   * Delivers all active retained messages that match the client's current subscriptions.
   * @param clientId The identifier of the client that needs historical retained messages.
   */
  async handleRetained(clientId: ClientId): Promise<void> {
    const handler = this.clientHandlerList.get(clientId);
    if (!handler) {
      return;
    }

    for await (const { topicFilter } of this.getSubscriptions(clientId)) {
      for (const retainedPacket of this.retainedMatches(topicFilter)) {
        await handler(retainedPacket);
      }
    }
  }

  /**
   * helper for handleRetained that matches topicFilters against retained
   *  packets directly in the database
   */
  private *retainedMatches(
    topicFilter: TopicFilter,
  ): Generator<PublishPacket, void, unknown> {
    let hasWildcards = false;

    const sqlLike = topicFilter.replace(/\/#|#|\+/g, () => {
      hasWildcards = true;
      return "%";
    });

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
      const statement = this.db.prepare(
        "select topic, packet, payload from retained where topic like ?",
      );

      const rowIterator = statement.iterate(sqlLike) as IterableIterator<{
        topic: string;
        packet: string;
        payload: Uint8Array | null;
      }>;

      const mqttRegex = topicFilterToRegExp(topicFilter);

      for (const row of rowIterator) {
        if (mqttRegex.test(row.topic)) {
          const packet = deserializePacket(row.packet, row.payload);
          yield packet;
        }
      }
    }
  }

  /** Halts, flushes and shuts active internal database connection scopes safely. */
  close(): void {
    this.db.close();
  }
}
