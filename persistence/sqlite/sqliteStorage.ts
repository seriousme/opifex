import type sqlite from "node:sqlite";
import type {
  ClientId,
  PacketId,
  PublishPacket,
  Topic,
  TopicFilter,
} from "../deps.ts";
import type {
  ClientRegistrationResult,
  ClientSubscription,
} from "../persistence.ts";
import { PacketDirection } from "../storage.ts";
import type { IStorageProvider, TrieSubscription } from "../storage.ts";
import { topicFilterToRegExp } from "../deps.ts";
import { deleteClientState, initializeDatabase } from "./sqliteDatabase.ts";

const SQLITE_DATABASE_URL = ":memory:";

function serializePacket(
  packet: PublishPacket,
): { packetJson: string; payloadBlob: Uint8Array | null } {
  const packetJson = JSON.stringify({ ...packet, payload: undefined });
  const payloadBlob = packet.payload ? packet.payload : null;
  return { packetJson, payloadBlob };
}

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

export class SqliteStorage implements IStorageProvider {
  private db: sqlite.DatabaseSync;

  // A clean statement registry bound strictly to this class instance
  private statements!: {
    // Sessions
    saveSession: sqlite.StatementSync;
    getSession: sqlite.StatementSync;

    // Subscriptions
    saveSubscription: sqlite.StatementSync;
    deleteSubscription: sqlite.StatementSync;
    listSubscriptions: sqlite.StatementSync;
    listAllSubscriptions: sqlite.StatementSync;

    // Pending Incoming Packets
    saveIncoming: sqlite.StatementSync;
    getIncoming: sqlite.StatementSync;
    deleteIncoming: sqlite.StatementSync;
    listIncoming: sqlite.StatementSync;

    // Pending Outgoing Packets
    saveOutgoing: sqlite.StatementSync;
    getOutgoing: sqlite.StatementSync;
    deleteOutgoing: sqlite.StatementSync;
    listOutgoing: sqlite.StatementSync;

    // ACKs
    saveAck: sqlite.StatementSync;
    hasAck: sqlite.StatementSync;
    deleteAck: sqlite.StatementSync;
    listAcks: sqlite.StatementSync;

    // Retained
    saveRetained: sqlite.StatementSync;
    deleteRetained: sqlite.StatementSync;
    getRetainedExact: sqlite.StatementSync;
    listRetainedLike: sqlite.StatementSync;
  };

  constructor(db: string | sqlite.DatabaseSync = SQLITE_DATABASE_URL) {
    if (typeof db === "string") {
      this.db = initializeDatabase(db);
    } else {
      this.db = db;
    }

    this.prepareAllStatements();
  }

  private prepareAllStatements() {
    this.statements = {
      // Sessions
      saveSession: this.db.prepare(`
        insert into client_sessions (client_id, session_data) 
        values (?, ?)
        on conflict(client_id) do update set session_data = excluded.session_data
      `),
      getSession: this.db.prepare(`
        select session_data from client_sessions where client_id = ?
      `),

      // Subscriptions
      saveSubscription: this.db.prepare(`
        insert into subscriptions (client_id, topic, subscription_data) 
        values (?, ?, ?)
        on conflict(client_id, topic) do update set subscription_data = excluded.subscription_data
      `),
      deleteSubscription: this.db.prepare(`
        delete from subscriptions where client_id = ? and topic = ?
      `),
      listSubscriptions: this.db.prepare(`
        select topic, subscription_data from subscriptions where client_id = ?
      `),
      listAllSubscriptions: this.db.prepare(`
        select client_id, topic, subscription_data from subscriptions
      `),

      // Pending Incoming Packets
      saveIncoming: this.db.prepare(`
        insert into pending_incoming (client_id, packet_id, packet, payload)
        values (?, ?, ?, ?)
        on conflict(client_id, packet_id) do update set packet = excluded.packet, payload = excluded.payload
      `),
      getIncoming: this.db.prepare(`
        select packet, payload from pending_incoming where client_id = ? and packet_id = ?
      `),
      deleteIncoming: this.db.prepare(`
        delete from pending_incoming where client_id = ? and packet_id = ?
      `),
      listIncoming: this.db.prepare(`
        select packet, payload from pending_incoming where client_id = ?
      `),

      // Pending Outgoing Packets
      saveOutgoing: this.db.prepare(`
        insert into pending_outgoing (client_id, packet_id, packet, payload)
        values (?, ?, ?, ?)
        on conflict(client_id, packet_id) do update set packet = excluded.packet, payload = excluded.payload
      `),
      getOutgoing: this.db.prepare(`
        select packet, payload from pending_outgoing where client_id = ? and packet_id = ?
      `),
      deleteOutgoing: this.db.prepare(`
        delete from pending_outgoing where client_id = ? and packet_id = ?
      `),
      listOutgoing: this.db.prepare(`
        select packet, payload from pending_outgoing where client_id = ?
      `),

      // ACKs
      saveAck: this.db.prepare(`
        insert into pending_ack_outgoing (client_id, packet_id)
        values (?, ?)
        on conflict(client_id, packet_id) do nothing
      `),
      hasAck: this.db.prepare(`
        select 1 from pending_ack_outgoing where client_id = ? and packet_id = ?
      `),
      deleteAck: this.db.prepare(`
        delete from pending_ack_outgoing where client_id = ? and packet_id = ?
      `),
      listAcks: this.db.prepare(`
        select packet_id from pending_ack_outgoing where client_id = ?
      `),

      // Retained Messages
      saveRetained: this.db.prepare(`
        insert into retained (topic, packet, payload)
        values (?, ?, ?)
        on conflict(topic) do update set packet = excluded.packet, payload = excluded.payload
      `),
      deleteRetained: this.db.prepare(`
        delete from retained where topic = ?
      `),
      getRetainedExact: this.db.prepare(`
        select packet, payload from retained where topic = ?
      `),
      listRetainedLike: this.db.prepare(`
        select topic, packet, payload from retained where topic like ?
      `),
    };
  }

  initialize(): Promise<void> {
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.db.close();
    return Promise.resolve();
  }

  // --- Sessions ---
  saveSession(
    clientId: ClientId,
    session: ClientRegistrationResult,
  ): Promise<void> {
    this.statements.saveSession.run(clientId, JSON.stringify(session));
    return Promise.resolve();
  }

  getSession(clientId: ClientId): Promise<ClientRegistrationResult | null> {
    const row = this.statements.getSession.get(clientId) as {
      session_data: string;
    } | undefined;
    return Promise.resolve(row ? JSON.parse(row.session_data) : null);
  }

  deleteSession(clientId: ClientId): Promise<void> {
    deleteClientState(this.db, clientId);
    return Promise.resolve();
  }

  async *listAllSessions(): AsyncIterableIterator<
    { clientId: ClientId; session: ClientRegistrationResult }
  > {
    for (
      const row of this.statements.listAllSubscriptions
        .iterate() as IterableIterator<
          { client_id: string; session_data: string }
        >
    ) {
      yield {
        clientId: row.client_id,
        session: JSON.parse(row.session_data),
      };
    }
  }

  // --- Subscriptions ---
  saveSubscription(clientId: ClientId, sub: ClientSubscription): Promise<void> {
    const subData = {
      qos: sub.qos,
      noLocal: sub.noLocal,
      retainAsPublished: sub.retainAsPublished,
      retainHandling: sub.retainHandling,
      subscriptionIdentifier: sub.subscriptionIdentifier,
    };

    this.statements.saveSubscription.run(
      clientId,
      sub.topicFilter,
      JSON.stringify(subData),
    );
    return Promise.resolve();
  }

  deleteSubscription(
    clientId: ClientId,
    topicFilter: TopicFilter,
  ): Promise<void> {
    this.statements.deleteSubscription.run(clientId, topicFilter);
    return Promise.resolve();
  }

  async *listSubscriptions(
    clientId: ClientId,
  ): AsyncIterableIterator<ClientSubscription> {
    const rows = this.statements.listSubscriptions.all(clientId) as Array<{
      topic: string;
      subscription_data: string;
    }>;

    for (const row of rows) {
      const sub = JSON.parse(row.subscription_data);
      sub.topicFilter = row.topic;
      yield sub;
    }
  }

  async *listAllSubscriptions(): AsyncIterableIterator<TrieSubscription> {
    const rows = this.statements.listAllSubscriptions.all() as Array<{
      client_id: string;
      topic: string;
      subscription_data: string;
    }>;

    for (const row of rows) {
      const sub = JSON.parse(row.subscription_data);
      sub.topicFilter = row.topic;
      sub.clientId = row.client_id;
      yield sub;
    }
  }

  // --- Pending Packets (Incoming & Outgoing) ---
  savePendingPacket(
    clientId: ClientId,
    direction: PacketDirection,
    packet: PublishPacket,
  ): Promise<void> {
    if (packet.id === undefined) return Promise.resolve();

    const { packetJson, payloadBlob } = serializePacket(packet);
    const stmt = direction === PacketDirection.Incoming
      ? this.statements.saveIncoming
      : this.statements.saveOutgoing;

    stmt.run(clientId, packet.id, packetJson, payloadBlob);
    return Promise.resolve();
  }

  getPendingPacket(
    clientId: ClientId,
    direction: PacketDirection,
    packetId: PacketId,
  ): Promise<PublishPacket | null> {
    const stmt = direction === PacketDirection.Incoming
      ? this.statements.getIncoming
      : this.statements.getOutgoing;
    const row = stmt.get(clientId, packetId) as {
      packet: string;
      payload: Uint8Array | null;
    } | undefined;

    if (!row) return Promise.resolve(null);
    return Promise.resolve(deserializePacket(row.packet, row.payload));
  }

  deletePendingPacket(
    clientId: ClientId,
    direction: PacketDirection,
    packetId: PacketId,
  ): Promise<boolean> {
    const stmt = direction === PacketDirection.Incoming
      ? this.statements.deleteIncoming
      : this.statements.deleteOutgoing;
    const info = stmt.run(clientId, packetId);

    return Promise.resolve(info.changes > 0);
  }

  async *listPendingPackets(
    clientId: ClientId,
    direction: PacketDirection,
  ): AsyncIterableIterator<PublishPacket> {
    const stmt = direction === PacketDirection.Incoming
      ? this.statements.listIncoming
      : this.statements.listOutgoing;

    const rows = stmt.all(clientId) as Array<{
      packet: string;
      payload: Uint8Array | null;
    }>;

    for (const row of rows) {
      yield deserializePacket(row.packet, row.payload);
    }
  }

  // --- ACKs ---
  savePendingAck(clientId: ClientId, packetId: PacketId): Promise<void> {
    this.statements.saveAck.run(clientId, packetId);
    return Promise.resolve();
  }

  hasPendingAck(clientId: ClientId, packetId: PacketId): Promise<boolean> {
    const row = this.statements.hasAck.get(clientId, packetId);
    return Promise.resolve(row !== undefined);
  }

  deletePendingAck(clientId: ClientId, packetId: PacketId): Promise<boolean> {
    const info = this.statements.deleteAck.run(clientId, packetId);
    return Promise.resolve(info.changes > 0);
  }

  async *listPendingAcks(clientId: ClientId): AsyncIterableIterator<PacketId> {
    const rows = this.statements.listAcks.all(clientId) as Array<{
      packet_id: number;
    }>;

    for (const row of rows) {
      yield row.packet_id as PacketId;
    }
  }

  // --- Retained Messages ---
  saveRetained(topic: Topic, packet: PublishPacket): Promise<void> {
    const { packetJson, payloadBlob } = serializePacket(packet);
    this.statements.saveRetained.run(topic, packetJson, payloadBlob);
    return Promise.resolve();
  }

  deleteRetained(topic: Topic): Promise<void> {
    this.statements.deleteRetained.run(topic);
    return Promise.resolve();
  }

  async *listRetainedMatches(
    topicFilter: TopicFilter,
  ): AsyncIterableIterator<PublishPacket> {
    let hasWildcards = false;
    const sqlLike = topicFilter.replace(/\/#|#|\+/g, () => {
      hasWildcards = true;
      return "%";
    });

    if (!hasWildcards) {
      const rows = this.statements.getRetainedExact.all(topicFilter) as Array<{
        packet: string;
        payload: Uint8Array | null;
      }>;

      for (const row of rows) {
        yield deserializePacket(row.packet, row.payload);
      }
    } else {
      const rows = this.statements.listRetainedLike.all(sqlLike) as Array<{
        topic: string;
        packet: string;
        payload: Uint8Array | null;
      }>;

      const regex = topicFilterToRegExp(topicFilter);
      for (const row of rows) {
        if (regex.test(row.topic)) {
          yield deserializePacket(row.packet, row.payload);
        }
      }
    }
  }
}
