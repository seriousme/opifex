import assert from "node:assert/strict";
import { test } from "node:test";
import { deleteClientState, initializeDatabase } from "./sqliteDatabase.ts";

test("initializeDatabase creates the expected schema tables", () => {
  const db = initializeDatabase(":memory:");
  const rows = db
    .prepare(
      "select name from sqlite_master where type = 'table' and name in ('client_sessions','subscriptions','pending_incoming','pending_outgoing','pending_ack_outgoing','retained') order by name",
    )
    .all() as Array<{ name: string }>;

  assert.deepStrictEqual(
    rows.map((row) => row.name),
    [
      "client_sessions",
      "pending_ack_outgoing",
      "pending_incoming",
      "pending_outgoing",
      "retained",
      "subscriptions",
    ],
  );
});

test("deleteClientState removes persisted state for one client only", () => {
  const db = initializeDatabase(":memory:");
  db.prepare(
    "insert into client_sessions(client_id, existing_session) values(?, ?)",
  ).run("client-a", 1);
  db.prepare("insert into subscriptions(client_id, topic, qos) values(?, ?, ?)")
    .run("client-a", "/a", 1);
  db.prepare("insert into pending_incoming(client_id, packet_id) values(?, ?)")
    .run("client-a", 42);
  db.prepare(
    "insert into pending_outgoing(client_id, packet_id, packet, payload) values(?, ?, ?, ?)",
  ).run("client-a", 43, "{}", null);
  db.prepare(
    "insert into pending_ack_outgoing(client_id, packet_id) values(?, ?)",
  ).run("client-a", 44);
  db.prepare(
    "insert into client_sessions(client_id, existing_session) values(?, ?)",
  ).run("client-b", 0);
  db.prepare("insert into subscriptions(client_id, topic, qos) values(?, ?, ?)")
    .run("client-b", "/b", 2);

  deleteClientState(db, "client-a");

  assert.equal(
    (db.prepare(
      "select count(*) as count from client_sessions where client_id = ?",
    ).get("client-a") as { count: number }).count,
    0,
  );
  assert.equal(
    (db.prepare(
      "select count(*) as count from subscriptions where client_id = ?",
    ).get("client-a") as { count: number }).count,
    0,
  );
  assert.equal(
    (db.prepare(
      "select count(*) as count from pending_incoming where client_id = ?",
    ).get("client-a") as { count: number }).count,
    0,
  );
  assert.equal(
    (db.prepare(
      "select count(*) as count from pending_outgoing where client_id = ?",
    ).get("client-a") as { count: number }).count,
    0,
  );
  assert.equal(
    (db.prepare(
      "select count(*) as count from pending_ack_outgoing where client_id = ?",
    ).get("client-a") as { count: number }).count,
    0,
  );
  assert.equal(
    (db.prepare(
      "select count(*) as count from client_sessions where client_id = ?",
    ).get("client-b") as { count: number }).count,
    1,
  );
});
