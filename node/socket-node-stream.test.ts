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

test("Conn.write - successfully writes data", async () => {
  const { conn, stream } = createMockConn();
  const data = new Uint8Array([0x01, 0x02, 0x03]);

  const bytesWritten = await conn.write(data);
  assert.equal(bytesWritten, data.length, "Number of written bytes matches");

  const chunk = stream.read();
  assert.deepStrictEqual(
    new Uint8Array(chunk),
    data,
    "The stream received the correct data",
  );

  conn.close();
});

test("Conn.write - respects backpressure and waits for drain event", async () => {
  const { conn, stream } = createMockConn();
  const data = new Uint8Array([0x01, 0x02, 0x03]);

  // Force stream.write to return false to simulate a full internal buffer (backpressure)
  stream.write = () => false;

  let writeResolved = false;
  const writePromise = conn.write(data).then((bytes) => {
    writeResolved = true;
    return bytes;
  });

  // Yield execution shortly to ensure the promise hasn't resolved prematurely
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    writeResolved,
    false,
    "Write promise should pend while backpressure is active",
  );

  // Emit the drain event to signal the buffer has cleared
  stream.emit("drain");

  const bytesWritten = await writePromise;
  assert.equal(bytesWritten, data.length, "Resolves after drain event fires");
  assert.equal(writeResolved, true);

  conn.close();
});

test("Conn.read - reads exact number of bytes", async () => {
  const { conn, stream } = createMockConn();
  const data = new Uint8Array([10, 20, 30, 40, 50]);

  stream.write(data);

  const result = await conn.read(3);
  assert.deepStrictEqual(
    result,
    new Uint8Array([10, 20, 30]),
    "First 3 bytes match",
  );

  const restResult = await conn.read(2);
  assert.deepStrictEqual(
    restResult,
    new Uint8Array([40, 50]),
    "Remaining bytes match via the leftover buffer",
  );

  conn.close();
});

test("Conn.read - waits for async data (readable event)", async () => {
  const { conn, stream } = createMockConn();

  const readPromise = conn.read(2);

  // Simulate network latency using setImmediate or setTimeout
  await new Promise((resolve) => setTimeout(resolve, 10));
  stream.write(new Uint8Array([0xAA, 0xBB]));

  const result = await readPromise;
  assert.deepStrictEqual(
    result,
    new Uint8Array([0xAA, 0xBB]),
    "Data correctly received after async wait",
  );

  conn.close();
});

test("Conn.close - gracefully closes the connection and streams", async () => {
  const { conn, stream, closeCalled } = createMockConn();

  assert.equal(closeCalled.count, 0, "Closer has not been called yet");

  conn.close();

  assert.equal(closeCalled.count, 1, "Closer is called exactly once");
  assert.equal(stream.destroyed, true, "The underlying stream is destroyed");

  await assert.rejects(
    conn.write(new Uint8Array([1])),
    /Stream is closed or not writable/,
    "Writing to a closed connection throws an error",
  );

  const readResult = await conn.read(1);
  assert.equal(
    readResult,
    null,
    "Reading from a closed connection returns null",
  );
});

test("Conn.read - length less than 0 returns null", async () => {
  const { conn } = createMockConn();

  const result = await conn.read(-5);
  assert.equal(result, null, "Reading with a negative length returns null");

  conn.close();
});

test("Conn.read - length equal to 0 returns empty Uint8Array", async () => {
  const { conn } = createMockConn();

  const result = await conn.read(0);
  assert.deepStrictEqual(
    result,
    new Uint8Array(0),
    "Reading 0 bytes returns an empty Uint8Array",
  );

  conn.close();
});

test("Conn.read - stream errors while waiting for data (returns null)", async () => {
  const { conn, stream } = createMockConn();

  // Prevent Node.js from crashing due to an unhandled stream error during test execution
  stream.on("error", () => {});

  const readPromise = conn.read(5);

  // Emit error event to invoke internal error tracking state
  stream.emit("error", new Error("Network failure"));

  const result = await readPromise;
  assert.equal(
    result,
    null,
    "Returns null when the stream errors out during an active read",
  );

  conn.close();
});

test("Conn.read - chunk is larger than requested (populates leftover)", async () => {
  const { conn, stream } = createMockConn();
  const largeChunk = new Uint8Array([1, 2, 3, 4, 5]);

  stream.write(largeChunk);

  const result1 = await conn.read(2);
  assert.deepStrictEqual(
    result1,
    new Uint8Array([1, 2]),
    "Returns the exact requested chunk size",
  );

  const result2 = await conn.read(2);
  assert.deepStrictEqual(
    result2,
    new Uint8Array([3, 4]),
    "Returns the next bytes from the leftover buffer",
  );

  const result3 = await conn.read(1);
  assert.deepStrictEqual(
    result3,
    new Uint8Array([5]),
    "Returns the last remaining byte from leftover",
  );

  conn.close();
});

test("Conn.read - partial leftover is not enough (combines leftover and new stream chunk)", async () => {
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

test("Conn.write - rejects immediately if stream.writable is false", async () => {
  const { conn, stream } = createMockConn();

  Object.defineProperty(stream, "writable", { value: false });

  await assert.rejects(
    conn.write(new Uint8Array([1, 2, 3])),
    /Stream is closed or not writable/,
    "Rejects immediately when stream.writable is false",
  );

  conn.close();
});

test("Conn.read - fulfilled entirely from leftover buffer (skips while loop)", async () => {
  const { conn, stream } = createMockConn();
  const data = new Uint8Array([10, 20, 30, 40, 50]);

  // 1. Populate the leftover buffer by reading less than what was written
  stream.write(data);
  await conn.read(2); // Leaves [30, 40, 50] in leftover

  // 2. Request an amount that can be fully satisfied by the leftover buffer
  const result = await conn.read(2);
  assert.deepStrictEqual(
    result,
    new Uint8Array([30, 40]),
    "Successfully fulfilled entirely from the leftover buffer",
  );

  // 3. Verify the remaining byte is still preserved
  const finalResult = await conn.read(1);
  assert.deepStrictEqual(
    finalResult,
    new Uint8Array([50]),
    "The remaining byte in leftover is still accessible",
  );

  conn.close();
});

test("Conn - handles unexpected stream close event from underlying resource", () => {
  const { conn, stream } = createMockConn();

  // Initially, the connection should not be marked as closed
  assert.equal(conn["closed"], false, "Connection is open initially");

  // Simulate the underlying socket/stream closing unexpectedly from the remote side
  stream.emit("close");

  // Verify that the permanent 'close' listener was triggered and updated the internal state
  assert.equal(
    conn["closed"],
    true,
    "Connection internally updates to closed when stream emits close",
  );

  // Clean up to ensure resources are disposed
  conn.close();
});

test("Conn.write - rejects the promise if stream.write invokes the callback with an error", async () => {
  const { conn, stream } = createMockConn();
  const data = new Uint8Array([1, 2, 3]);

  // Simulate a write error by overriding stream.write
  // It forces the callback to be invoked with an Error object
  stream.write = (_chunk, callback) => {
    if (typeof callback === "function") {
      // Execute the callback with an error asynchronously, mimicking Node.js behavior
      setImmediate(() => callback(new Error("Write pipeline failure")));
    }
    return false;
  };

  // Verify that the conn.write Promise rejects with the exact error
  await assert.rejects(
    conn.write(data),
    /Write pipeline failure/,
    "The write promise should reject when the stream callback receives an error",
  );

  conn.close();
});
