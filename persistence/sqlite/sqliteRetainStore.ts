import type { DatabaseSync } from "node:sqlite";
import type { PublishPacket } from "../../mqttPacket/publish.ts";
import type { Topic, TopicFilter } from "../../mqttPacket/types.ts";
import { topicFilterToRegExp } from "../../utils/mod.ts";
import { deserializePacket, serializePacket } from "./sqliteStoreUtils.ts";

/**
 * Manages database retention and retrieval of published MQTT messages marked with a retain flag.
 */
export class SqliteRetainStore {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  set(key: Topic, packet: PublishPacket): void {
    const serialized = serializePacket(packet);
    this.db.prepare(
      "insert or replace into retained(topic, packet, payload) values(?, ?, ?)",
    ).run(key, serialized.packet, serialized.payload);
  }

  delete(key: Topic): void {
    this.db.prepare("delete from retained where topic = ?").run(key);
  }

  *matches(topicFilter: TopicFilter): Generator<PublishPacket, void, unknown> {
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
}
