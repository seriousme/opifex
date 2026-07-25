import sqlite from "node:sqlite";
import type { ClientId } from "../../mqttPacket/types.ts";

/**
 * Instantiates the physical relational structures and schemas required by the persistence engine.
 * @param filename Filepath location or memory target specifier.
 */
export function initializeDatabase(filename: string): sqlite.DatabaseSync {
  const db = new sqlite.DatabaseSync(filename);
  db.exec(`
    CREATE TABLE IF NOT EXISTS client_sessions (
      client_id    TEXT PRIMARY KEY,
      session_data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      client_id         TEXT NOT NULL,
      topic             TEXT NOT NULL,
      subscription_data TEXT NOT NULL,
      PRIMARY KEY (client_id, topic)
    );

    CREATE TABLE IF NOT EXISTS pending_incoming (
      seq_id     INTEGER PRIMARY KEY AUTOINCREMENT, -- Guarantees absolute insertion order
      client_id  TEXT NOT NULL,
      packet_id  INTEGER NOT NULL,
      packet     TEXT NOT NULL,
      payload    BLOB,
      expires_at INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (client_id, packet_id)
    );

    CREATE TABLE IF NOT EXISTS pending_outgoing (
      seq_id     INTEGER PRIMARY KEY AUTOINCREMENT, -- Guarantees absolute insertion order
      client_id  TEXT NOT NULL,
      packet_id  INTEGER NOT NULL,
      packet     TEXT NOT NULL,
      payload    BLOB,
      expires_at INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (client_id, packet_id)
    );

    CREATE TABLE IF NOT EXISTS pending_ack_outgoing (
      client_id TEXT NOT NULL,
      packet_id INTEGER NOT NULL,
      PRIMARY KEY (client_id, packet_id)
    );

    CREATE TABLE IF NOT EXISTS retained (
      topic   TEXT PRIMARY KEY,
      packet  TEXT NOT NULL,
      payload BLOB
    );
  `);
  return db;
}

export type AllStatements = {
  // Sessions
  saveSession: sqlite.StatementSync;
  getSession: sqlite.StatementSync;

  // Subscriptions
  saveSubscription: sqlite.StatementSync;
  deleteSubscription: sqlite.StatementSync;
  listSubscriptions: sqlite.StatementSync;
  listAllSubscriptions: sqlite.StatementSync;

  // Pending Incoming Packets
  saveIncoming: sqlite.StatementSync;
  getIncoming: sqlite.StatementSync;
  deleteIncoming: sqlite.StatementSync;
  listIncoming: sqlite.StatementSync;

  // Pending Outgoing Packets
  saveOutgoing: sqlite.StatementSync;
  getOutgoing: sqlite.StatementSync;
  deleteOutgoing: sqlite.StatementSync;
  listOutgoing: sqlite.StatementSync;

  // ACKs
  saveAck: sqlite.StatementSync;
  hasAck: sqlite.StatementSync;
  deleteAck: sqlite.StatementSync;
  listAcks: sqlite.StatementSync;

  // Retained
  saveRetained: sqlite.StatementSync;
  deleteRetained: sqlite.StatementSync;
  getRetainedExact: sqlite.StatementSync;
  listRetainedLike: sqlite.StatementSync;
};

/**
 * Instantiates the physical relational structures and schemas required by the persistence engine.
 * @param db  the database for which to prepare the statements
 */
export function prepareAllStatements(db: sqlite.DatabaseSync): AllStatements {
  return {
    // Sessions
    saveSession: db.prepare(`
      INSERT INTO client_sessions (client_id, session_data) 
      VALUES (?, ?)
      ON CONFLICT(client_id) DO UPDATE SET 
        session_data = excluded.session_data
    `),

    getSession: db.prepare(`
      SELECT session_data 
      FROM client_sessions 
      WHERE client_id = ?
    `),

    // Subscriptions
    saveSubscription: db.prepare(`
      INSERT INTO subscriptions (client_id, topic, subscription_data) 
      VALUES (?, ?, ?)
      ON CONFLICT(client_id, topic) DO UPDATE SET 
        subscription_data = excluded.subscription_data
    `),

    deleteSubscription: db.prepare(`
      DELETE FROM subscriptions 
      WHERE client_id = ? AND topic = ?
    `),

    listSubscriptions: db.prepare(`
      SELECT topic, subscription_data 
      FROM subscriptions 
      WHERE client_id = ?
    `),

    listAllSubscriptions: db.prepare(`
      SELECT client_id, topic, subscription_data 
      FROM subscriptions
    `),

    // Pending Incoming Packets
    saveIncoming: db.prepare(`
      INSERT INTO pending_incoming (client_id, packet_id, packet, payload, expires_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(client_id, packet_id) DO UPDATE SET 
        packet = excluded.packet, 
        payload = excluded.payload,
        expires_at = excluded.expires_at
    `),

    getIncoming: db.prepare(`
      SELECT packet, payload, expires_at 
      FROM pending_incoming 
      WHERE client_id = ? AND packet_id = ?
    `),

    deleteIncoming: db.prepare(`
      DELETE FROM pending_incoming 
      WHERE client_id = ? AND packet_id = ?
    `),

    listIncoming: db.prepare(`
      SELECT packet, payload, expires_at 
      FROM pending_incoming 
      WHERE client_id = ? 
      ORDER BY seq_id ASC
    `),

    // Pending Outgoing Packets
    saveOutgoing: db.prepare(`
      INSERT INTO pending_outgoing (client_id, packet_id, packet, payload, expires_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(client_id, packet_id) DO UPDATE SET 
        packet = excluded.packet, 
        payload = excluded.payload,
        expires_at = excluded.expires_at
    `),

    getOutgoing: db.prepare(`
      SELECT packet, payload, expires_at 
      FROM pending_outgoing 
      WHERE client_id = ? AND packet_id = ?
    `),

    deleteOutgoing: db.prepare(`
      DELETE FROM pending_outgoing 
      WHERE client_id = ? AND packet_id = ?
    `),

    listOutgoing: db.prepare(`
      SELECT packet, payload, expires_at 
      FROM pending_outgoing 
      WHERE client_id = ? 
      ORDER BY seq_id ASC
    `),

    // ACKs
    saveAck: db.prepare(`
      INSERT INTO pending_ack_outgoing (client_id, packet_id)
      VALUES (?, ?)
      ON CONFLICT(client_id, packet_id) DO NOTHING
    `),

    hasAck: db.prepare(`
      SELECT 1 
      FROM pending_ack_outgoing 
      WHERE client_id = ? AND packet_id = ?
    `),

    deleteAck: db.prepare(`
      DELETE FROM pending_ack_outgoing 
      WHERE client_id = ? AND packet_id = ?
    `),

    listAcks: db.prepare(`
      SELECT packet_id 
      FROM pending_ack_outgoing 
      WHERE client_id = ?
    `),

    // Retained Messages
    saveRetained: db.prepare(`
      INSERT INTO retained (topic, packet, payload)
      VALUES (?, ?, ?)
      ON CONFLICT(topic) DO UPDATE SET 
        packet = excluded.packet, 
        payload = excluded.payload
    `),

    deleteRetained: db.prepare(`
      DELETE FROM retained 
      WHERE topic = ?
    `),

    getRetainedExact: db.prepare(`
      SELECT packet, payload 
      FROM retained 
      WHERE topic = ?
    `),

    listRetainedLike: db.prepare(`
      SELECT topic, packet, payload 
      FROM retained 
      WHERE topic LIKE ?
    `),
  };
}

/**
 * Truncates and drops relational state assignments under targeted clients inside atomic scopes.
 * @param db Connection reference context.
 * @param clientId Specific target client ID tracking token.
 */
export function deleteClientState(
  db: sqlite.DatabaseSync,
  clientId: ClientId,
): void {
  db.exec("begin;");
  db.prepare(
    "delete from subscriptions where client_id = ?",
  ).run(clientId);
  db.prepare(
    "delete from pending_incoming where client_id = ?",
  ).run(clientId);
  db.prepare(
    "delete from pending_outgoing where client_id = ?",
  ).run(clientId);
  db.prepare(
    "delete from pending_ack_outgoing where client_id = ?",
  ).run(clientId);
  db.prepare(
    "delete from client_sessions where client_id = ?",
  ).run(clientId);
  db.exec("commit;");
}
