import type { DatabaseSync } from "node:sqlite";
import type { ClientId, QoS, TopicFilter } from "../../mqttPacket/types.ts";
import type { ISubscriptionStore } from "../store.ts";

/**
 * A database-backed Subscription store that tracks active topics and QoS constraints for a client.
 */
export class SqliteSubscriptionStore implements ISubscriptionStore {
  private db: DatabaseSync;
  private clientId: ClientId;

  constructor(
    db: DatabaseSync,
    clientId: ClientId,
  ) {
    this.db = db;
    this.clientId = clientId;
  }

  size(): Promise<number> {
    const row = this.db.prepare(
      "select count(*) as count from subscriptions where client_id = ?",
    ).get(this.clientId) as { count: number };
    return Promise.resolve(row?.count ?? 0);
  }

  set(key: TopicFilter, value: QoS): Promise<void> {
    this.db.prepare(
      "insert or replace into subscriptions(client_id, topic, qos) values(?, ?, ?)",
    ).run(this.clientId, key, value);
    return Promise.resolve();
  }

  get(key: TopicFilter): Promise<QoS | undefined> {
    const row = this.db.prepare(
      "select qos from subscriptions where client_id = ? and topic = ?",
    ).get(this.clientId, key) as
      | { qos: QoS }
      | undefined;

    if (!row) return Promise.resolve(undefined);
    return Promise.resolve(row.qos);
  }

  has(key: TopicFilter): Promise<boolean> {
    const row = this.db.prepare(
      "select 1 from subscriptions where client_id = ? and topic = ? limit 1",
    ).get(this.clientId, key);
    return Promise.resolve(!!row);
  }

  delete(key: TopicFilter): Promise<boolean> {
    const info = this.db.prepare(
      "delete from subscriptions where client_id = ? and topic = ? ",
    ).run(this.clientId, key);
    return Promise.resolve(info.changes > 0);
  }

  clear(): Promise<void> {
    this.db.prepare(
      "delete from subscriptions where client_id = ?",
    ).run(this.clientId);
    return Promise.resolve();
  }

  async *keys(): AsyncIterableIterator<TopicFilter> {
    const query = this.db.prepare(
      "select topic from subscriptions where client_id = ?",
    );

    for (
      const row of query.iterate(this.clientId) as Iterable<
        { topic: TopicFilter }
      >
    ) {
      yield row.topic;
    }
  }

  async *entries(): AsyncIterableIterator<[TopicFilter, QoS]> {
    const query = this.db.prepare(
      "select topic, qos from subscriptions where client_id = ?",
    );

    for (
      const row of query.iterate(this.clientId) as Iterable<
        { topic: TopicFilter; qos: QoS }
      >
    ) {
      yield [row.topic, row.qos];
    }
  }
}
