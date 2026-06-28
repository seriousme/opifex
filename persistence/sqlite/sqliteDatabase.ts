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
        existing_session integer not null
      );
      create table if not exists subscriptions (
        client_id text not null,
        topic text not null,
        qos integer not null,
        primary key(client_id, topic)
      );
      create table if not exists pending_incoming (
        client_id text not null,
        packet_id integer not null,
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
