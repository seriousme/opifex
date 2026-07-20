import sqlite from "node:sqlite";
import type { ClientId } from "../../mqttPacket/types.ts";

/**
 * Instantiates the physical relational structures and schemas required by the persistence engine.
 * @param filename Filepath location or memory target specifier.
 */
export function initializeDatabase(filename: string): sqlite.DatabaseSync {
  const db = new sqlite.DatabaseSync(filename);
  db.exec(`
      create table if not exists client_sessions (
        client_id text primary key,
        session_data text not null
      );
      create table if not exists subscriptions (
        client_id text not null,
        topic text not null,
        subscription_data text not null,
        primary key(client_id, topic)
      );
      create table if not exists pending_incoming (
        client_id text not null,
        packet_id integer not null,
        packet text not null,
        payload blob,
        primary key(client_id, packet_id)
      );
      create table if not exists pending_outgoing (
        client_id text not null,
        packet_id integer not null,
        packet text not null,
        payload blob,
        primary key(client_id, packet_id)
      );
      create table if not exists pending_ack_outgoing (
        client_id text not null,
        packet_id integer not null,
        primary key(client_id, packet_id)
      );
      create table if not exists retained (
        topic text primary key,
        packet text not null,
        payload blob
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
          insert into client_sessions (client_id, session_data) 
          values (?, ?)
          on conflict(client_id) do update set session_data = excluded.session_data
        `),
    getSession: db.prepare(`
          select session_data from client_sessions where client_id = ?
        `),

    // Subscriptions
    saveSubscription: db.prepare(`
          insert into subscriptions (client_id, topic, subscription_data) 
          values (?, ?, ?)
          on conflict(client_id, topic) do update set subscription_data = excluded.subscription_data
        `),
    deleteSubscription: db.prepare(`
          delete from subscriptions where client_id = ? and topic = ?
        `),
    listSubscriptions: db.prepare(`
          select topic, subscription_data from subscriptions where client_id = ?
        `),
    listAllSubscriptions: db.prepare(`
          select client_id, topic, subscription_data from subscriptions
        `),

    // Pending Incoming Packets
    saveIncoming: db.prepare(`
          insert into pending_incoming (client_id, packet_id, packet, payload)
          values (?, ?, ?, ?)
          on conflict(client_id, packet_id) do update set packet = excluded.packet, payload = excluded.payload
        `),
    getIncoming: db.prepare(`
          select packet, payload from pending_incoming where client_id = ? and packet_id = ?
        `),
    deleteIncoming: db.prepare(`
          delete from pending_incoming where client_id = ? and packet_id = ?
        `),
    listIncoming: db.prepare(`
          select packet, payload from pending_incoming where client_id = ?
        `),

    // Pending Outgoing Packets
    saveOutgoing: db.prepare(`
          insert into pending_outgoing (client_id, packet_id, packet, payload)
          values (?, ?, ?, ?)
          on conflict(client_id, packet_id) do update set packet = excluded.packet, payload = excluded.payload
        `),
    getOutgoing: db.prepare(`
          select packet, payload from pending_outgoing where client_id = ? and packet_id = ?
        `),
    deleteOutgoing: db.prepare(`
          delete from pending_outgoing where client_id = ? and packet_id = ?
        `),
    listOutgoing: db.prepare(`
          select packet, payload from pending_outgoing where client_id = ?
        `),

    // ACKs
    saveAck: db.prepare(`
          insert into pending_ack_outgoing (client_id, packet_id)
          values (?, ?)
          on conflict(client_id, packet_id) do nothing
        `),
    hasAck: db.prepare(`
          select 1 from pending_ack_outgoing where client_id = ? and packet_id = ?
        `),
    deleteAck: db.prepare(`
          delete from pending_ack_outgoing where client_id = ? and packet_id = ?
        `),
    listAcks: db.prepare(`
          select packet_id from pending_ack_outgoing where client_id = ?
        `),

    // Retained Messages
    saveRetained: db.prepare(`
          insert into retained (topic, packet, payload)
          values (?, ?, ?)
          on conflict(topic) do update set packet = excluded.packet, payload = excluded.payload
        `),
    deleteRetained: db.prepare(`
          delete from retained where topic = ?
        `),
    getRetainedExact: db.prepare(`
          select packet, payload from retained where topic = ?
        `),
    listRetainedLike: db.prepare(`
          select topic, packet, payload from retained where topic like ?
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
