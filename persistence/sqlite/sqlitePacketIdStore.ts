import type { DatabaseSync } from "node:sqlite";
import type { ClientId, PacketId } from "../../mqttPacket/types.ts";
import type { IPacketIdStore } from "../store.ts";

/**
 * A database-backed Packet ID store that records acknowledgement IDs (such as QoS 2 tokens).
 */
export class SqlitePacketIdStore implements IPacketIdStore {
  private db: DatabaseSync;
  private clientId: ClientId;
  private tableName: "pending_incoming" | "pending_ack_outgoing";

  constructor(
    db: DatabaseSync,
    clientId: ClientId,
    tableName: "pending_incoming" | "pending_ack_outgoing",
  ) {
    this.db = db;
    this.clientId = clientId;
    this.tableName = tableName;
  }

  add(value: PacketId): this {
    this.db.prepare(
      `insert or ignore into ${this.tableName}(client_id, packet_id) values(?, ?)`,
    ).run(this.clientId, value);
    return this;
  }

  delete(value: PacketId): boolean {
    const deleted = this.db.prepare(
      `delete from ${this.tableName} where client_id = ? and packet_id = ?`,
    ).run(this.clientId, value).changes > 0;
    return deleted;
  }

  clear(): void {
    this.db.prepare(
      `delete from ${this.tableName} where client_id = ?`,
    ).run(this.clientId);
  }

  has(key: PacketId): boolean {
    const row = this.db.prepare(
      `select 1 from ${this.tableName} where client_id = ? and packet_id = ? limit 1`,
    ).get(this.clientId, key);

    return !!row;
  }

  get size(): number {
    const row = this.db.prepare(
      `select count(*) as count from ${this.tableName} where client_id = ?`,
    ).get(this.clientId) as { count: number };

    return row?.count ?? 0;
  }

  keys(): IterableIterator<PacketId> {
    const rows = this.db.prepare(
      `select packet_id from ${this.tableName} where client_id = ?`,
    ).all(this.clientId) as Array<{ packet_id: PacketId }>;
    return rows.map((r) => r.packet_id)[Symbol.iterator]();
  }
}
