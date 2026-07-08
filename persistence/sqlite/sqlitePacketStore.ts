import type { DatabaseSync } from "node:sqlite";
import type { PublishPacket } from "../../mqttPacket/publish.ts";
import type { ClientId, PacketId } from "../../mqttPacket/types.ts";
import type { IPacketStore } from "../store.ts";
import { deserializePacket, serializePacket } from "./sqliteStoreUtils.ts";

/**
 * A database-backed Store that persists and retrieves MQTT packets from Sqlite
 * without caching them in memory.
 */
export class SqlitePacketStore implements IPacketStore {
  private db: DatabaseSync;
  private clientId: ClientId;

  constructor(
    db: DatabaseSync,
    clientId: ClientId,
  ) {
    this.db = db;
    this.clientId = clientId;
  }

  set(key: PacketId, value: PublishPacket): Promise<void> {
    const serialized = serializePacket(value);
    this.db.prepare(
      "insert or replace into pending_outgoing(client_id, packet_id, packet, payload) values(?, ?, ?, ?)",
    ).run(this.clientId, key, serialized.packet, serialized.payload);
    return Promise.resolve();
  }

  get(key: PacketId): Promise<PublishPacket | undefined> {
    const row = this.db.prepare(
      "select packet, payload from pending_outgoing where client_id = ? and packet_id = ?",
    ).get(this.clientId, key) as
      | { packet: string; payload: Uint8Array | null }
      | undefined;

    if (!row) return Promise.resolve(undefined);
    return Promise.resolve(deserializePacket(row.packet, row.payload));
  }

  has(key: PacketId): Promise<boolean> {
    const row = this.db.prepare(
      "select 1 from pending_outgoing where client_id = ? and packet_id = ? limit 1",
    ).get(this.clientId, key);
    return Promise.resolve(!!row);
  }

  delete(key: PacketId): Promise<boolean> {
    const info = this.db.prepare(
      "delete from pending_outgoing where client_id = ? and packet_id = ?",
    ).run(this.clientId, key);
    return Promise.resolve(info.changes > 0);
  }

  clear(): Promise<void> {
    this.db.prepare(
      "delete from pending_outgoing where client_id = ?",
    ).run(this.clientId);
    return Promise.resolve();
  }

  size(): Promise<number> {
    const row = this.db.prepare(
      "select count(*) as count from pending_outgoing where client_id = ?",
    ).get(this.clientId) as { count: number };
    return Promise.resolve(row?.count ?? 0);
  }

  async *keys(): AsyncIterableIterator<PacketId> {
    const query = this.db.prepare(
      "select packet_id from pending_outgoing where client_id = ?",
    );
    for (
      const row of query.iterate(this.clientId) as Iterable<
        { packet_id: PacketId }
      >
    ) {
      yield row.packet_id;
    }
  }

  async *values(): AsyncIterableIterator<PublishPacket> {
    const query = this.db.prepare(
      "select packet, payload from pending_outgoing where client_id = ?",
    );
    for (
      const row of query.iterate(this.clientId) as Iterable<
        { packet: string; payload: Uint8Array | null }
      >
    ) {
      yield deserializePacket(row.packet, row.payload);
    }
  }
}
