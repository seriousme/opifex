/**
 * @module
 * SQLite-backed persistence implementation for MQTT clients, sessions, and subscriptions.
 * Suitable for persistent production or testing environments using node:sqlite.
 */
import type sqlite from "node:sqlite";
import type {
  ClientId,
  PacketId,
  PublishPacket,
  QoS,
  Topic,
  TopicFilter,
  TRetainHandling,
} from "../deps.ts";

import type {
  ClientRegistrationResult,
  ClientSubscription,
  Handler,
  IPersistence,
} from "../persistence.ts";

import { MAX_PACKET_ID } from "../mod.ts";
import { assert, topicFilterToRegExp, Trie } from "../deps.ts";
import { deleteClientState, initializeDatabase } from "./sqliteDatabase.ts";

const SQLITE_DATABASE_URL = ":memory:";

/**
 * Extended representation of a subscription supporting MQTT v5 options for
 * storage in the table
 */
export type ClientSubscriptionData = Omit<ClientSubscription, "topicFilter"> & {
  clientId: ClientId;
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
  public clientHandlerList: Map<ClientId, Handler> = new Map();

  private db: sqlite.DatabaseSync;

  // in memory session info cache
  private sessionTable = new Map<ClientId, ClientRegistrationResult>();

  // In-memory Trie to retain fast MQTT topic matching performance
  private trie = new Trie<ClientSubscriptionData>();
  // In-memory Packet ID generator per client
  private packetIdCounters = new Map<ClientId, number>();

  constructor(db: string | sqlite.DatabaseSync = SQLITE_DATABASE_URL) {
    if (typeof db === "string") {
      this.db = initializeDatabase(db);
    } else {
      this.db = db; // Gebruik de al geïnitialiseerde test-database
    }
    this.rebuildTrie();
    this.rebuildSessionTable();
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
   * Rebuilds the in-memory session table from the database on startup.
   */
  private rebuildTrie(): void {
    const stmt = this.db.prepare(
      "select client_id, topic, subscription_data from subscriptions",
    );
    for (
      const row of stmt.iterate() as IterableIterator<
        { client_id: string; topic: string; subscription_data: string }
      >
    ) {
      const subdata = JSON.parse(row.subscription_data);
      subdata.clientId = row.client_id;
      this.trie.add(row.topic, subdata);
    }
  }

  /**
   * Rebuilds the in-memory Trie from the database on startup.
   */
  private rebuildSessionTable(): void {
    this.sessionTable.clear();
    const stmt = this.db.prepare(
      "select client_id, session_data from client_sessions",
    );
    for (
      const row of stmt.iterate() as IterableIterator<
        { client_id: string; session_data: string }
      >
    ) {
      const sessionData = JSON.parse(row.session_data);
      this.sessionTable.set(row.client_id, sessionData);
    }
  }

  registerClient(
    clientId: ClientId,
    handler: Handler,
  ): Promise<ClientRegistrationResult> {
    this.clientHandlerList.set(clientId, handler);

    const sessionData = this.sessionTable.get(clientId);
    if (sessionData) {
      sessionData.existingSession = true;
      this.db.prepare(
        "update client_sessions set session_data = ? where client_id = ?",
      ).run(JSON.stringify(sessionData), clientId);

      this.sessionTable.set(clientId, sessionData);
      return Promise.resolve(sessionData);
    }

    const newSession = { existingSession: false };
    // Begin transaction for clean registration of a new client
    this.db.exec("begin;");
    try {
      this.db.prepare(
        "insert into client_sessions (client_id, session_data) values (?, ?)",
      ).run(clientId, JSON.stringify(newSession));
      this.db.exec("commit;");
    } catch (err) {
      this.db.exec("rollback;");
      throw err;
    }
    // add it to the cache
    this.sessionTable.set(clientId, newSession);
    return Promise.resolve(newSession);
  }

  async deregisterClient(clientId: ClientId): Promise<void> {
    this.clientHandlerList.delete(clientId);
    this.sessionTable.delete(clientId);

    // Explicitly remove subscriptions from the in-memory trie first
    for await (const { topicFilter } of this.listSubscriptions(clientId)) {
      this.trie.remove(topicFilter, { clientId });
    }

    // Purge all related relational records via the sqliteDatabase.ts helper
    deleteClientState(this.db, clientId);

    return Promise.resolve();
  }

  disconnectClient(clientId: ClientId): Promise<void> {
    this.clientHandlerList.delete(clientId);
    return Promise.resolve();
  }

  // --- Subscriptions ---
  subscribe(
    clientId: ClientId,
    topicFilter: TopicFilter,
    qos: QoS,
    noLocal?: boolean,
    retainAsPublished?: boolean,
    retainHandling?: TRetainHandling,
    subscriptionIdentifier?: number,
  ): Promise<void> {
    const subData = {
      qos,
      noLocal,
      retainAsPublished,
      retainHandling,
      subscriptionIdentifier,
    };
    // Perform an SQL upsert
    this.db.prepare(`
      insert into subscriptions (client_id, topic, subscription_data) 
      values (?, ?, ?)
      on conflict(client_id, topic) do update set subscription_data = excluded.subscription_data
    `).run(clientId, topicFilter, JSON.stringify(subData));

    // Sync changes to the in-memory trie (clear older matching variants to avoid duplication)
    this.trie.remove(topicFilter, { clientId });
    const subscription = subData as ClientSubscriptionData;
    subscription.clientId = clientId;
    this.trie.add(topicFilter, subscription);

    return Promise.resolve();
  }

  unsubscribe(clientId: ClientId, topicFilter: TopicFilter): Promise<void> {
    this.trie.remove(topicFilter, { clientId });
    this.db.prepare(
      "delete from subscriptions where client_id = ? and topic = ?",
    ).run(clientId, topicFilter);

    return Promise.resolve();
  }

  async *listSubscriptions(
    clientId: ClientId,
  ): AsyncIterableIterator<ClientSubscription> {
    const stmt = this.db.prepare(
      "select topic, subscription_data from subscriptions where client_id = ?",
    );

    for (
      const row of stmt.iterate(clientId) as IterableIterator<
        { topic: string; subscription_data: string }
      >
    ) {
      const subdata = JSON.parse(row.subscription_data);
      subdata.topicFilter = row.topic;
      yield subdata;
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

  // --- Business Logic (MQTT v5 Compliant) ---

  /**
   * Evaluates incoming data payloads, routes them into matching subscriber sessions,
   * updates global retained state flags, and manages MQTT v5 attributes.
   */
  async publish(
    publisherClientId: ClientId,
    topic: Topic,
    packet: PublishPacket,
  ): Promise<void> {
    if (packet.retain) {
      if (!packet.payload?.byteLength) {
        this.delRetained(packet.topic);
      } else {
        this.setRetained(topic, packet);
      }
    }

    // Map to group matched client details & aggregate choices when multiple filters match
    const clients = new Map<
      ClientId,
      {
        maxQos: QoS;
        retainAsPublished: boolean;
        subIds: number[];
      }
    >();

    for (const sub of this.trie.match(topic)) {
      if (sub.noLocal && sub.clientId === publisherClientId) {
        continue;
      }

      let clientTarget = clients.get(sub.clientId);
      if (!clientTarget) {
        clientTarget = {
          maxQos: sub.qos,
          retainAsPublished: !!sub.retainAsPublished,
          subIds: [],
        };
        clients.set(sub.clientId, clientTarget);
      } else {
        // Evaluate Max QoS across all matches
        if (sub.qos > clientTarget.maxQos) {
          clientTarget.maxQos = sub.qos;
        }
        // If at least one matching subscription has Retain As Published, it overrides and remains true.
        if (sub.retainAsPublished) {
          clientTarget.retainAsPublished = true;
        }
      }

      if (sub.subscriptionIdentifier !== undefined) {
        clientTarget.subIds.push(sub.subscriptionIdentifier);
      }
    }

    for (const [clientId, targetOpts] of clients) {
      const newPacket = structuredClone(packet);

      if (!targetOpts.retainAsPublished) {
        newPacket.retain = false;
      }

      const originalQos = packet.qos || 0;
      newPacket.qos = originalQos < targetOpts.maxQos
        ? originalQos
        : targetOpts.maxQos;

      // Assign multiple subscription identifiers if matched [MQTT-3.3.4-3]
      if (targetOpts.subIds.length > 0 && newPacket.protocolLevel === 5) {
        newPacket.properties = {
          ...newPacket.properties,
          subscriptionIdentifiers: targetOpts.subIds,
        };
      }

      await this.dispatch(clientId, newPacket);
    }
  }

  private delRetained(topic: Topic) {
    this.db.prepare("delete from retained where topic = ?").run(
      topic,
    );
  }

  private setRetained(topic: Topic, packet: PublishPacket) {
    const { packetJson, payloadBlob } = serializePacket(packet);

    this.db.prepare(`
          insert into retained (topic, packet, payload)
          values (?, ?, ?)
          on conflict(topic) do update set packet = excluded.packet, payload = excluded.payload
         `).run(topic, packetJson, payloadBlob);
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

    const matchedSubsMap = new Map<Topic, ClientSubscription[]>();
    const retainedPacketMap = new Map<Topic, PublishPacket>();
    for await (const sub of this.listSubscriptions(clientId)) {
      for (const retainedPacket of this.retainedMatches(sub.topicFilter)) {
        retainedPacketMap.set(retainedPacket.topic, retainedPacket);
        const matchedSubs = matchedSubsMap.getOrInsert(
          retainedPacket.topic,
          [],
        );
        matchedSubs.push(sub);
      }
    }
    for (const topic of retainedPacketMap.keys()) {
      const packet = retainedPacketMap.get(topic);
      const matchedSubscriptions = matchedSubsMap.get(topic);
      if (!packet || matchedSubscriptions?.length === 0) {
        continue;
      }

      // Aggregate state options if multiple matching subscriptions are returned
      let maxQos: QoS = 0;
      let retainAsPublished = false;
      const subIds: number[] = [];
      let shouldDeliver = false;

      const clientSession = this.sessionTable.get(clientId);
      const existingSession = clientSession?.existingSession;

      for (const subData of matchedSubscriptions!) {
        const retainHandling = subData.retainHandling ?? 0;

        // 2 = Do not send retained messages at the time of the subscribe
        if (retainHandling === 2) {
          continue;
        }
        // 1 = Send retained messages at subscribe only if the subscription does not currently exist
        if (retainHandling === 1 && existingSession) {
          continue;
        }

        // 0 = Send retained messages at the time of the subscribe
        shouldDeliver = true;

        if (subData.qos > maxQos) {
          maxQos = subData.qos;
        }
        if (subData.retainAsPublished) {
          retainAsPublished = true;
        }
        if (subData.subscriptionIdentifier !== undefined) {
          subIds.push(subData.subscriptionIdentifier);
        }
      }

      if (!shouldDeliver) {
        continue;
      }

      const newPacket = structuredClone(packet);

      if (!retainAsPublished) {
        newPacket.retain = false;
      }

      if (subIds.length > 0 && newPacket.protocolLevel === 5) {
        newPacket.properties = {
          ...newPacket.properties,
          subscriptionIdentifiers: subIds,
        };
      }

      const originalQos = packet.qos || 0;
      newPacket.qos = originalQos < maxQos ? originalQos : maxQos;

      await handler(newPacket);
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
