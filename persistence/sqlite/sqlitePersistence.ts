import { MqttPersistence } from "../mqttPersistence.ts";
import { SqliteStorage } from "./sqliteStorage.ts";
import type sqlite from "node:sqlite";

const SQLITE_DATABASE_URL = ":memory:";

export class SqlitePersistence extends MqttPersistence {
  private storageInstance: SqliteStorage;

  constructor(db: string | sqlite.DatabaseSync = SQLITE_DATABASE_URL) {
    const storage = new SqliteStorage(db);
    super(storage);
    this.storageInstance = storage;
  }

  /**
   * Convenient lifecycle method combining instance creation and initialization.
   */
  static async start(
    db: string | sqlite.DatabaseSync = SQLITE_DATABASE_URL,
  ): Promise<SqlitePersistence> {
    const persistence = new SqlitePersistence(db);
    await persistence.initialize();
    return persistence;
  }

  /**
   * Overrides close to make sure the underlying database file
   * handle is cleaned up correctly when the persistence is halted.
   */
  async close(): Promise<void> {
    if (this.storageInstance.close) {
      await this.storageInstance.close();
    }
  }
}
