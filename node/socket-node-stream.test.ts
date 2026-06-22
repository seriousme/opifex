import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { Conn, type SockConn } from "./socket-node-stream.ts";

// Helper to create a mock SockConn using a PassThrough duplex stream
function createMockConn(): {
  conn: Conn;
  stream: PassThrough;
  closeCalled: { count: number };
} {
  const stream = new PassThrough();
  const closeCalled = { count: 0 };

  const sockConn: SockConn = {
    stream,
    close: () => {
      closeCalled.count++;
    },
    remoteAddr: {
      transport: "tcp",
      hostname: "127.0.0.1",
      port: 1883,
    },
  };

  const conn = new Conn(sockConn);
  return { conn, stream, closeCalled };
}

test("Conn.write - successfully writes data", async function () {
  const { conn, stream } = createMockConn();
  const data = new Uint8Array([0x01, 0x02, 0x03]);

  // Write data to the connection
  const bytesWritten = await conn.write(data);
  assert.equal(bytesWritten, data.length, "Number of written bytes matches");

  // Verify that the underlying stream received the data
  const chunk = stream.read();
  assert.deepStrictEqual(
    new Uint8Array(chunk),
    data,
    "The stream received the correct data",
  );

  conn.close();
});

test("Conn.read - reads exact number of bytes", async function () {
  const { conn, stream } = createMockConn();
  const data = new Uint8Array([10, 20, 30, 40, 50]);

  // Push data into the stream so read() can pick it up immediately
  stream.write(data);

  // Request exactly 3 bytes
  const result = await conn.read(3);
  assert.deepStrictEqual(
    result,
    new Uint8Array([10, 20, 30]),
    "First 3 bytes match",
  );

  // Request the remaining 2 bytes (should be fetched from the leftover buffer)
  const restResult = await conn.read(2);
  assert.deepStrictEqual(
    restResult,
    new Uint8Array([40, 50]),
    "Remaining bytes match via the leftover buffer",
  );

  conn.close();
});

test("Conn.read - waits for async data (readable event)", async function () {
  const { conn, stream } = createMockConn();

  // Start the read action in parallel (waiting for data)
  const readPromise = conn.read(2);

  // Simulate network delay and then write data to the stream
  await new Promise((resolve) => setTimeout(resolve, 50));
  stream.write(new Uint8Array([0xAA, 0xBB]));

  const result = await readPromise;
  assert.deepStrictEqual(
    result,
    new Uint8Array([0xAA, 0xBB]),
    "Data correctly received after async wait",
  );

  conn.close();
});

test("Conn.close - gracefully closes the connection and streams", async function () {
  const { conn, stream, closeCalled } = createMockConn();

  assert.equal(closeCalled.count, 0, "Closer has not been called yet");

  conn.close();

  assert.equal(closeCalled.count, 1, "Closer is called exactly once");
  assert.equal(stream.destroyed, true, "The underlying stream is destroyed");

  // Writing after close should fail
  await assert.rejects(
    conn.write(new Uint8Array([1])),
    /Stream is closed or not writable/,
    "Writing to a closed connection throws an error",
  );

  // Reading after close should return null
  const readResult = await conn.read(1);
  assert.equal(
    readResult,
    null,
    "Reading from a closed connection returns null",
  );
});

test("Conn.read - length less than 0 returns null", async function () {
  const { conn } = createMockConn();

  const result = await conn.read(-5);
  assert.equal(result, null, "Reading with a negative length returns null");

  conn.close();
});

test("Conn.read - length equal to 0 returns empty Uint8Array", async function () {
  const { conn } = createMockConn();

  const result = await conn.read(0);
  assert.deepStrictEqual(
    result,
    new Uint8Array(0),
    "Reading 0 bytes returns an empty Uint8Array",
  );

  conn.close();
});

test("Conn.read - stream errors while waiting for data (returns null)", async function () {
  const { conn, stream } = createMockConn();

  // Attach a no-op error listener to prevent Node.js from crashing
  // on an unhandled exception outside of the Conn class
  stream.on("error", () => {});

  const readPromise = conn.read(5);

  // Emit the error, which sets this.closed = true internally
  stream.emit("error", new Error("Network failure"));
  stream.end();

  const result = await readPromise;
  assert.equal(
    result,
    null,
    "Returns null when the stream errors out during an active read",
  );

  conn.close();
});

test("Conn.read - stream errors while waiting for data (returns null)", async function () {
  const { conn, stream } = createMockConn();

  const readPromise = conn.read(5);

  // Simulate an error event on the stream
  stream.emit("error", new Error("Network failure"));

  const result = await readPromise;
  assert.equal(
    result,
    null,
    "Returns null when the stream errors out during an active read",
  );

  conn.close();
});

test("Conn.read - chunk is larger than requested (populates leftover)", async function () {
  const { conn, stream } = createMockConn();
  const largeChunk = new Uint8Array([1, 2, 3, 4, 5]);

  stream.write(largeChunk);

  // Request only 2 bytes out of 5
  const result1 = await conn.read(2);
  assert.deepStrictEqual(
    result1,
    new Uint8Array([1, 2]),
    "Returns the exact requested chunk size",
  );

  // Request next 2 bytes (should pull from leftover)
  const result2 = await conn.read(2);
  assert.deepStrictEqual(
    result2,
    new Uint8Array([3, 4]),
    "Returns the next bytes from the leftover buffer",
  );

  // Request the final byte
  const result3 = await conn.read(1);
  assert.deepStrictEqual(
    result3,
    new Uint8Array([5]),
    "Returns the last remaining byte from leftover",
  );

  conn.close();
});

test("Conn.read - partial leftover is not enough (combines leftover and new stream chunk)", async function () {
  const { conn, stream } = createMockConn();

  // 1. Write 3 bytes and read 2 (leaving 1 byte [0x03] in leftover)
  stream.write(new Uint8Array([0x01, 0x02, 0x03]));
  await conn.read(2);

  // 2. Write new data to the stream
  stream.write(new Uint8Array([0x04, 0x05]));

  // 3. Request 3 bytes (needs 1 from leftover + 2 from stream)
  const result = await conn.read(3);
  assert.deepStrictEqual(
    result,
    new Uint8Array([0x03, 0x04, 0x05]),
    "Combines leftover data with newly arrived stream data",
  );

  conn.close();
});

test("Conn.write - rejects immediately if stream.writable is false", async function () {
  const { conn, stream } = createMockConn();

  // Force the stream's writable state to false without destroying it completely
  Object.defineProperty(stream, "writable", { value: false });

  await assert.rejects(
    conn.write(new Uint8Array([1, 2, 3])),
    /Stream is closed or not writable/,
    "Rejects immediately when stream.writable is false",
  );

  conn.close();
});
