/**
 * @module
 * SQLite-backed sub-stores managing persistent states for single client sessions,
 * including incoming/outgoing packets, active subscriptions, and retained messages.
 */

export {
  type SessionParameters,
  SQLiteClientSessionStore,
} from "./sqliteClientSessionStore.ts";
export { SqlitePacketIdStore } from "./sqlitePacketIdStore.ts";
export { SqlitePacketStore } from "./sqlitePacketStore.ts";
export { SqliteRetainStore } from "./sqliteRetainStore.ts";
export { SqliteSubscriptionStore } from "./sqliteSubscriptionStore.ts";
export {
  createIterator,
  deserializePacket,
  type SerializedPacket,
  serializePacket,
} from "./sqliteStoreUtils.ts";

import type { DatabaseSync } from "node:sqlite";
import type { PublishPacket } from "../../mqttPacket/publish.ts";
import type { ClientId, PacketId, QoS, Topic } from "../../mqttPacket/types.ts";
import { MAX_PACKET_ID } from "../persistence.ts";
import type {
  IPacketIdStore,
  IPacketStore,
  IStore,
  ISubscriptionStore,
} from "../store.ts";
import { SqlitePacketIdStore } from "./sqlitePacketIdStore.ts";
import { SqlitePacketStore } from "./sqlitePacketStore.ts";
import { SqliteSubscriptionStore } from "./sqliteSubscriptionStore.ts";

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

  nextId(): PacketId {
    let attempts = 0;
    do {
      this.lastPacketId = (this.lastPacketId % MAX_PACKET_ID) + 1;
      attempts++;

      const isBusy = this.db.prepare(`
      SELECT 1 FROM pending_outgoing WHERE packet_id = ?
      UNION ALL
      SELECT 1 FROM pending_ack_outgoing WHERE packet_id = ?
      LIMIT 1
    `).get(this.lastPacketId, this.lastPacketId);

      if (!isBusy) {
        return this.lastPacketId;
      }
    } while (attempts < MAX_PACKET_ID);

    throw new Error("No unused packetId available");
  }
}
