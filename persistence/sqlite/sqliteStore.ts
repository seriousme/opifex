/**
 * @module
 * Sqlite-backed sub-stores managing persistent states for single client sessions,
 * including incoming/outgoing packets, active subscriptions, and retained messages.
 */

export {
  type SessionParameters,
  SqliteClientSessionStore,
} from "./sqliteClientSessionStore.ts";
export { SqlitePacketIdStore } from "./sqlitePacketIdStore.ts";
export { SqlitePacketStore } from "./sqlitePacketStore.ts";
export { SqliteRetainStore } from "./sqliteRetainStore.ts";
export { SqliteSubscriptionStore } from "./sqliteSubscriptionStore.ts";
export {
  deserializePacket,
  type SerializedPacket,
  serializePacket,
} from "./sqliteStoreUtils.ts";

import type { DatabaseSync } from "node:sqlite";
import type { ClientId, PacketId } from "../../mqttPacket/types.ts";
import { MAX_PACKET_ID } from "../persistence.ts";
import type { IStore } from "../store.ts";
import { SqlitePacketIdStore } from "./sqlitePacketIdStore.ts";
import { SqlitePacketStore } from "./sqlitePacketStore.ts";
import { SqliteSubscriptionStore } from "./sqliteSubscriptionStore.ts";

/**
 * Core Sqlite structural implementation organizing all underlying database relational sub-stores.
 */
export class SqliteStore implements IStore {
  private lastPacketId = 0;
  private db: DatabaseSync;
  clientId: ClientId;
  pendingIncoming: SqlitePacketStore;
  pendingOutgoing: SqlitePacketStore;
  pendingAckOutgoing: SqlitePacketIdStore;
  subscriptions: SqliteSubscriptionStore;

  constructor(
    db: DatabaseSync,
    clientId: ClientId,
  ) {
    this.db = db;
    this.clientId = clientId;
    this.pendingIncoming = new SqlitePacketStore(
      db,
      clientId,
      "pending_incoming",
    );
    this.pendingOutgoing = new SqlitePacketStore(
      db,
      clientId,
      "pending_outgoing",
    );
    this.pendingAckOutgoing = new SqlitePacketIdStore(
      db,
      clientId,
    );
    this.subscriptions = new SqliteSubscriptionStore(
      db,
      clientId,
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
