import assert from "node:assert/strict";
import { test } from "node:test";
import { Duplex, Readable, Writable } from "node:stream";
import { Conn } from "./socket-node-stream.ts";
import type { SockConn } from "./socket-node-stream.ts";

//
class Uint8Writable extends Writable {
  private buff: Uint8Array;
  private pos: number;
  constructor(result: Uint8Array) {
    super({ decodeStrings: false });
    this.buff = result;
    this.pos = 0;
  }

  override _write(chunk: Uint8Array, _encoding: string, callback: () => void) {
    this.buff.set(chunk, this.pos);
    this.pos += chunk.length;
    callback();
  }
}

function createMockDuplex(
  chunks: Uint8Array[],
  target: Uint8Array,
): SockConn {
  return {
    stream: Duplex.from({
      readable: Readable.from(chunks),
      writable: new Uint8Writable(target),
    }),
    close: () => {},
  };
}

test("Conn.read reads exact amount of bytes from continuous stream", async () => {
  const chunk1 = new Uint8Array([1, 2, 3]);
  const chunk2 = new Uint8Array([4, 5, 6, 7]);
  const target = new Uint8Array(10);

  const sockConn = createMockDuplex([chunk1, chunk2], target);
  const conn = new Conn(sockConn);

  const res1 = await conn.read(2);
  assert.deepStrictEqual(res1, new Uint8Array([1, 2]));

  const res2 = await conn.read(4);
  assert.deepStrictEqual(res2, new Uint8Array([3, 4, 5, 6]));

  const res3 = await conn.read(1);
  assert.deepStrictEqual(res3, new Uint8Array([7]));
});

test("Conn.read returns null when length < 0 or already closed", async () => {
  const target = new Uint8Array(0);
  const sockConn = createMockDuplex([new Uint8Array([1, 2, 3])], target);
  const conn = new Conn(sockConn);

  const resNull = await conn.read(-1);
  assert.deepStrictEqual(resNull, null);

  conn.close();
  const resClosed = await conn.read(2);
  assert.deepStrictEqual(resClosed, null);
});

test("Conn.read returns empty array when length = 0", async () => {
  const chunk = new Uint8Array([1, 2, 3]);
  const mockTarget = new Uint8Array(0);
  const sockConn = createMockDuplex([chunk], mockTarget);
  const conn = new Conn(sockConn);

  const res = await conn.read(0);
  assert.deepStrictEqual(res?.length, 0);
});

test("Conn.write successfully writes to Node.js stream", async () => {
  const target = new Uint8Array(3);
  const sockConn = createMockDuplex([], target);
  const conn = new Conn(sockConn);

  const dataToWrite = new Uint8Array([5, 10, 15]);
  const bytesWritten = await conn.write(dataToWrite);

  assert.deepStrictEqual(bytesWritten, 3);
  assert.deepStrictEqual(target, dataToWrite);
});

test("Conn.write rejects when connection is closed", async () => {
  const target = new Uint8Array();
  const sockConn = createMockDuplex([], target);
  const conn = new Conn(sockConn);

  conn.close();

  await assert.rejects(
    conn.write(new Uint8Array([1, 2])),
    /Stream is closed or not writable/,
  );
});

test("Conn.close destroys the underlying stream and updates status", () => {
  let destroyCalled = false;
  const target = new Uint8Array();
  const sockConn = createMockDuplex([], target);

  // Overschrijf de destroy methode om te kijken of hij wordt aangeroepen
  const originalDestroy = sockConn.stream.destroy;
  sockConn.stream.destroy = function (this: Duplex, error?: Error) {
    destroyCalled = true;
    return originalDestroy.call(this, error);
  };

  const conn = new Conn(sockConn);

  conn.close();

  assert.deepStrictEqual(destroyCalled, true);
});
