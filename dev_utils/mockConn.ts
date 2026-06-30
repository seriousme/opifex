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

export function createMockSockConn(
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
