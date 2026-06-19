import assert from "node:assert/strict";
import { test } from "node:test";
import { Conn } from "./socket.ts";
import { createMockSockConn } from "../dev_utils/mod.ts";

test("Conn.read peaks and buffers partial data correctly", async () => {
  const chunk1 = new Uint8Array([1, 2, 3]);
  const chunk2 = new Uint8Array([4, 5, 6, 7]);
  const chunk3 = new Uint8Array([8, 9]);

  const mockTarget = new Uint8Array();
  const sockConn = createMockSockConn([chunk1, chunk2, chunk3], mockTarget);
  const conn = new Conn(sockConn);

  const res1 = await conn.read(2);
  assert.deepStrictEqual(res1, new Uint8Array([1, 2]));

  const res2 = await conn.read(3);
  assert.deepStrictEqual(res2, new Uint8Array([3, 4, 5]));

  const res3 = await conn.read(4);
  assert.deepStrictEqual(res3, new Uint8Array([6, 7, 8, 9]));
});

test("Conn.read returns null when stream ends before length is met", async () => {
  const chunk = new Uint8Array([1, 2, 3]);
  const mockTarget = new Uint8Array(0);
  const sockConn = createMockSockConn([chunk], mockTarget);
  const conn = new Conn(sockConn);

  // asking for5 bytes, but only 3 are available in the stream
  const res = await conn.read(5);
  assert.deepStrictEqual(res, null);
});

test("Conn.read returns null when length <= 0", async () => {
  const chunk = new Uint8Array([1, 2, 3]);
  const mockTarget = new Uint8Array(0);
  const sockConn = createMockSockConn([chunk], mockTarget);
  const conn = new Conn(sockConn);

  const res = await conn.read(-1);
  assert.deepStrictEqual(res, null);
});

test("Conn.read returns empty array when length = 0", async () => {
  const chunk = new Uint8Array([1, 2, 3]);
  const mockTarget = new Uint8Array(0);
  const sockConn = createMockSockConn([chunk], mockTarget);
  const conn = new Conn(sockConn);

  const res = await conn.read(0);
  assert.deepStrictEqual(res?.length, 0);
});

test("Conn.write successfully forwards data to writable stream", async () => {
  const dataToWrite = new Uint8Array([10, 20, 30, 40]);
  const mockTarget = new Uint8Array(4);
  const sockConn = createMockSockConn([], mockTarget);
  const conn = new Conn(sockConn);

  const bytesWritten = await conn.write(dataToWrite);

  assert.deepStrictEqual(bytesWritten, 4);
  assert.deepStrictEqual(mockTarget, dataToWrite);
});

test("Conn.write rejects when connection is closed", async () => {
  const mockTarget = new Uint8Array(4);
  const sockConn = createMockSockConn([], mockTarget);
  const conn = new Conn(sockConn);

  conn.close();

  await assert.rejects(
    conn.write(new Uint8Array([1, 2])),
    /Connection closed/,
  );
});

test("Conn.close closes writer, releases reader lock and sets closed flag", () => {
  const mockTarget = new Uint8Array(0);
  const sockConn = createMockSockConn([], mockTarget);
  const conn = new Conn(sockConn);

  assert.deepStrictEqual(conn.closed, false);

  conn.close();

  assert.deepStrictEqual(conn.closed, true);
});
