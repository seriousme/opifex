import type { AsyncQueue } from "../utils/mod.ts";
import { SockConn } from "../socket/socket.ts";

class Uint8Writer implements WritableStreamDefaultWriter {
  private buff: Uint8Array;
  private pos: number;
  closed = Promise.resolve(undefined);
  close = () => Promise.resolve();
  abort = () => Promise.resolve();
  ready = Promise.resolve(undefined);
  releaseLock = () => {};
  desiredSize = 20;

  constructor(
    buff: Uint8Array,
  ) {
    this.buff = buff;
    this.pos = 0;
  }
  write(chunk: Uint8Array): Promise<void> {
    this.buff.set(chunk, this.pos);
    this.pos += chunk.length;
    return Promise.resolve();
  }
}

class Uint8QueuedWriter implements WritableStreamDefaultWriter {
  private queue: AsyncQueue<Uint8Array>;
  closed = Promise.resolve(undefined);
  close = () => Promise.resolve();
  abort = () => Promise.resolve();
  ready = Promise.resolve(undefined);
  releaseLock = () => {};
  desiredSize = 20;

  constructor(
    queue: AsyncQueue<Uint8Array>,
  ) {
    this.queue = queue;
  }
  write(chunk: Uint8Array): Promise<void> {
    this.queue.push(chunk);
    return Promise.resolve();
  }
}

function ReadableStreamFrom(
  iterable: AsyncIterable<Uint8Array>,
): ReadableStream {
  if (!iterable || !(Symbol.asyncIterator in iterable)) {
    throw new TypeError("Argument must be an asyncIterable");
  }

  return new ReadableStream({
    type: "bytes",
    async pull(controller) {
      const iterator = iterable[Symbol.asyncIterator]();
      const next = await iterator.next();

      if (next.done) {
        controller.close();
        return;
      }
      controller.enqueue(next.value);
    },
  });
}

export class DummyConn implements SockConn {
  private closed = false;
  readable: ReadableStream;
  reader: ReadableStreamBYOBReader;
  writable: WritableStream<Uint8Array>;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  remoteAddr: Deno.Addr;

  constructor(
    readerBuffs: Uint8Array[],
    writerBuf: Uint8Array,
    remoteAddr: Deno.Addr = { transport: "tcp", hostname: "0.0.0.0", port: 0 },
  ) {
    const readBlob = new Blob(readerBuffs);
    this.readable = readBlob.stream();
    this.reader = this.readable.getReader({ mode: "byob" });
    this.writable = new WritableStream(new Uint8Writer(writerBuf));
    this.writer = this.writable.getWriter();
    this.remoteAddr = remoteAddr;
  }

  async read(buff: Uint8Array) {
    const buff2 = new Uint8Array(buff.length);
    const result = await this.reader.read(buff2);
    if (!result.done) {
      buff.set(result.value);
    }
    return result.value?.byteLength || null;
  }

  write(data: Uint8Array): Promise<number> {
    if (this.closed) {
      return Promise.reject();
    }
    this.writer.write(data);
    return new Promise((resolve) => resolve(data.length));
  }

  close() {
    if (!this.closed) {
      this.closed = true;
    }
  }

  closeWrite() {
    return Promise.resolve();
  }
}

export class DummyQueueConn implements SockConn {
  closed = false;
  readable: ReadableStream;
  reader: ReadableStreamBYOBReader;
  writable: WritableStream<Uint8Array>;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  remoteAddr: Deno.Addr;
  closer: () => void;

  constructor(
    r: AsyncQueue<Uint8Array>,
    w: AsyncQueue<Uint8Array>,
    closer = () => {},
    remoteAddr: Deno.Addr = { transport: "tcp", hostname: "0.0.0.0", port: 0 },
  ) {
    this.readable = ReadableStreamFrom(r);
    this.reader = this.readable.getReader({ mode: "byob" });
    this.writable = new WritableStream(new Uint8QueuedWriter(w));
    this.writer = this.writable.getWriter();
    this.remoteAddr = remoteAddr;
    this.closer = closer;
  }

  async read(buff: Uint8Array) {
    const buff2 = new Uint8Array(buff.length);
    const result = await this.reader.read(buff2);
    if (!result.done) {
      buff.set(result.value);
    }
    return result.value?.byteLength || null;
  }

  write(data: Uint8Array): Promise<number> {
    if (this.closed) {
      return Promise.reject();
    }
    this.writer.write(data);
    return new Promise((resolve) => resolve(data.length));
  }

  close() {
    if (!this.closed) {
      this.closeWrite();
    }
  }

  closeWrite() {
    this.closed = true;
    this.closer();
    return Promise.resolve();
  }
}
