import type { DatabaseSync } from "node:sqlite";
import type { ClientId } from "../../mqttPacket/types.ts";
import type { SessionParameters } from "./sqliteStoreUtils.ts";

export type { SessionParameters } from "./sqliteStoreUtils.ts";

/**
 * Handles persistence boundaries for contextual client sessions metadata tracking.
 */
export class SqliteClientSessionStore {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  set(session: SessionParameters): this {
    this.db.prepare(
      "insert or replace into client_sessions(client_id, existing_session) values(?, ?)",
    ).run(session.clientId, session.existingSession ? 1 : 0);

    return this;
  }

  get(clientId: ClientId): SessionParameters | null {
    const row = this.db.prepare(
      "select client_id, existing_session from client_sessions where client_id = ?",
    ).get(clientId) as
      | { client_id: ClientId; existing_session: number }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      clientId: row.client_id,
      existingSession: !!row.existing_session,
    };
  }

  delete(clientId: ClientId): this {
    this.db.prepare(
      "delete from client_sessions where client_id = ?",
    ).run(clientId);
    return this;
  }
}
