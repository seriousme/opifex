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

  add(value: PacketId): Promise<void> {
    this.db.prepare(
      `insert or ignore into ${this.tableName}(client_id, packet_id) values(?, ?)`,
    ).run(this.clientId, value);
    return Promise.resolve();
  }
  delete(value: PacketId): Promise<boolean> {
    const deleted = this.db.prepare(
      `delete from ${this.tableName} where client_id = ? and packet_id = ?`,
    ).run(this.clientId, value).changes > 0;
    return Promise.resolve(deleted);
  }

  clear(): Promise<void> {
    this.db.prepare(
      `delete from ${this.tableName} where client_id = ?`,
    ).run(this.clientId);
    return Promise.resolve();
  }

  has(key: PacketId): Promise<boolean> {
    const row = this.db.prepare(
      `select 1 from ${this.tableName} where client_id = ? and packet_id = ? limit 1`,
    ).get(this.clientId, key);

    return Promise.resolve(!!row);
  }

  size(): Promise<number> {
    const row = this.db.prepare(
      `select count(*) as count from ${this.tableName} where client_id = ?`,
    ).get(this.clientId) as { count: number };

    return Promise.resolve(row?.count ?? 0);
  }

  async *keys(): AsyncIterableIterator<PacketId> {
    const query = this.db.prepare(
      `select packet_id from ${this.tableName} where client_id = ?`,
    );
    for (
      const row of query.iterate(this.clientId) as Iterable<
        { packet_id: PacketId }
      >
    ) {
      yield row.packet_id;
    }
  }
}
