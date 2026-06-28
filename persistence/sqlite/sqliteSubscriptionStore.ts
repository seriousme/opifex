import type { DatabaseSync } from "node:sqlite";
import type { ClientId, QoS, TopicFilter } from "../../mqttPacket/types.ts";
import type { ISubscriptionStore } from "../store.ts";
import { createIterator } from "./sqliteStoreUtils.ts";

/**
 * A database-backed Subscription store that tracks active topics and QoS constraints for a client.
 */
export class SqliteSubscriptionStore implements ISubscriptionStore {
  private db: DatabaseSync;
  private clientId: ClientId;

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

  get size(): number {
    const row = this.db.prepare(
      "select count(*) as count from subscriptions where client_id = ?",
    ).get(this.clientId) as { count: number };
    return row?.count ?? 0;
  }

  set(key: TopicFilter, value: QoS): this {
    this.db.prepare(
      "insert or replace into subscriptions(client_id, topic, qos) values(?, ?, ?)",
    ).run(this.clientId, key, value);
    return this;
  }

  get(key: TopicFilter): QoS | undefined {
    const row = this.db.prepare(
      "select qos from subscriptions where client_id = ? and topic = ?",
    ).get(this.clientId, key) as
      | { qos: QoS }
      | undefined;

    if (!row) return undefined;
    return row.qos;
  }

  has(key: TopicFilter): boolean {
    const row = this.db.prepare(
      "select 1 from subscriptions where client_id = ? and topic = ? limit 1",
    ).get(this.clientId, key);
    return !!row;
  }

  delete(key: TopicFilter): boolean {
    const info = this.db.prepare(
      "delete from subscriptions where client_id = ? and topic = ? ",
    ).run(this.clientId, key);
    return info.changes > 0;
  }

  clear(): void {
    this.db.prepare(
      "delete from subscriptions where client_id = ?",
    ).run(this.clientId);
  }

  keys(): IterableIterator<TopicFilter> {
    const rowIterator = this.db.prepare(
      "select topic from subscriptions where client_id = ?",
    ).iterate(this.clientId) as IterableIterator<{ topic: TopicFilter }>;

    return createIterator(rowIterator, (row) => row.topic);
  }

  values(): IterableIterator<QoS> {
    const rowIterator = this.db.prepare(
      "select qos from subscriptions where client_id = ?",
    ).iterate(this.clientId) as IterableIterator<{ qos: QoS }>;

    return createIterator(rowIterator, (row) => row.qos);
  }

  entries(): IterableIterator<[TopicFilter, QoS]> {
    const rowIterator = this.db.prepare(
      "select topic, qos from subscriptions where client_id = ?",
    ).iterate(this.clientId) as IterableIterator<
      { topic: TopicFilter; qos: QoS }
    >;

    return createIterator(
      rowIterator,
      (row) => [row.topic, row.qos] as [TopicFilter, QoS],
    );
  }
}
