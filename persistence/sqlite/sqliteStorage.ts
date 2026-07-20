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
import {
  deleteClientState,
  initializeDatabase,
  prepareAllStatements,
} from "./sqliteDatabase.ts";
import type { AllStatements } from "./sqliteDatabase.ts";

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

  private statements: AllStatements;

  constructor(db: string | sqlite.DatabaseSync = SQLITE_DATABASE_URL) {
    if (typeof db === "string") {
      this.db = initializeDatabase(db);
    } else {
      this.db = db;
    }
    this.statements = prepareAllStatements(this.db);
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
