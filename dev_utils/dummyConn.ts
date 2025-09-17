import type { AsyncQueue } from "../utils/mod.ts";

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

export function makeDummySockConn(
  readerBuffs: Uint8Array[],
  writerBuf: Uint8Array,
  close = () => {},
) {
  const readable = ReadableStream.from(readerBuffs);
  const writable = new WritableStream(new Uint8Writer(writerBuf));
  return {
    readable,
    writable,
    close,
  };
}

export function makeDummyQueueSockConn(
  r: AsyncQueue<Uint8Array>,
  w: AsyncQueue<Uint8Array>,
  close = () => {},
) {
  const readable = ReadableStream.from(r);
  const writable = new WritableStream(new Uint8QueuedWriter(w));
  return {
    readable,
    writable,
    close,
  };
}
