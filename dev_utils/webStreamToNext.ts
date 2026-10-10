import type { ConnAddr, ConnNext } from "../connNext/connNext.ts";
import { createWebStreamPair } from "./webStreamPair.ts";
import type { WebStreamPairEndpoint } from "./webStreamPair.ts";

/** wrapper class */
export class WebStreamConnNextWrapper {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  closed: boolean;
  private endPoint: WebStreamPairEndpoint;
  private leftover: Uint8Array = new Uint8Array(0);

  /** Create a new ConnNext object from a SockConn */
  constructor(endPoint: WebStreamPairEndpoint) {
    this.endPoint = endPoint;
    this.closed = false;
    this.reader = endPoint.readable.getReader();
    this.writer = endPoint.writable.getWriter();
    this.reader.closed.catch(() => {});
    this.writer.closed.catch(() => {});
  }

  /**
   * Writes data chunk to the underlying WebStream WritableStream
   */ async write(chunk: Uint8Array): Promise<void> {
    if (this.closed) {
      return Promise.reject(new Error("Pipe closed"));
    }
    try {
      await this.writer.write(chunk);
      return;
    } catch (err) {
      this.closed = true;
      throw err;
    }
  }

  /**
   * Reads data from the stream.
   * If `length` is provided, waits until exact number of bytes are buffered.
   */
  async read(length?: number): Promise<Uint8Array | null> {
    if (this.closed || (length ?? 0) < 0) {
      return null;
    }

    if (length === 0) {
      return new Uint8Array(0);
    }
    if (length === undefined) {
      if (this.leftover.length > 0) {
        const result = this.leftover;
        this.leftover = new Uint8Array(0);
        return result;
      }
      const { value, done } = await this.reader.read();
      if (value) {
        return value;
      }
      if (done) {
        return null;
      }
    }

    // Just to please typescript
    const bytesRequested = length === undefined ? 0 : length;

    const result = new Uint8Array(bytesRequested);
    let bytesAccumulated = 0;

    // Do we have data from the previous read()
    if (this.leftover.length > 0) {
      const take = Math.min(this.leftover.length, bytesRequested);
      result.set(this.leftover.subarray(0, take), bytesAccumulated);
      bytesAccumulated += take;
      this.leftover = this.leftover.subarray(take);
    }

    // Keep readin until we have enough data
    while (bytesAccumulated < bytesRequested) {
      const { value, done } = await this.reader.read();

      if (value) {
        const needed = bytesRequested - bytesAccumulated;

        if (value.length <= needed) {
          // We need the whole chunk
          result.set(value, bytesAccumulated);
          bytesAccumulated += value.length;
        } else {
          // Chunk is bigger than what we need
          result.set(value.subarray(0, needed), bytesAccumulated);
          bytesAccumulated += needed;
          // Save the rest for the next read() call
          this.leftover = value.subarray(needed);
        }
      }
      if (done) {
        // if the stream closed and not enough data was returned, return null
        return null;
      }
    }
    return result;
  }

  /**
   * Closes the reader, writer, and underlying WebStream pair endpoint.
   */
  close(): void {
    if (!this.closed) {
      this.closed = true;

      try {
        void this.reader.cancel().catch(() => {
          // ignore duplicate/late cancel attempts; the stream may already be closed
        });
        this.reader?.releaseLock();
        // deno-coverage-ignore
      } catch (_err) { /* swallow */ }

      // deno-coverage-ignore-start
      void this.writer.close().catch(() => {
        // ignore duplicate/late close attempts; the stream may already be closed
      });
      // deno-coverage-ignore-stop

      try {
        this.endPoint.close();
      } catch (_err) { /* swallow */ }
    }
  }
  async *[Symbol.asyncIterator]() {
    while (true) {
      const chunk = await this.read();
      if (chunk === null) {
        break;
      }
      yield chunk;
    }
  }
}

/**
 * Creates a pair of cross-connected ConnNext sockets backed by WebStreams.
 * Offers the exact same API as `createConnNextPair`.
 */
export function createConnNextPair(): {
  input: ConnNext;
  output: ConnNext;
} {
  const { input: webInput, output: webOutput } = createWebStreamPair();

  const mockAddr: ConnAddr = {
    transport: "tcp",
    hostname: "127.0.0.1",
    port: 1883,
  };

  const inputWrapper = new WebStreamConnNextWrapper(webInput);
  const outputWrapper = new WebStreamConnNextWrapper(webOutput);

  const input: ConnNext = {
    remoteAddr: mockAddr,
    localAddr: mockAddr,
    read: (length) => inputWrapper.read(length),
    write: (data) => inputWrapper.write(data),
    [Symbol.asyncIterator]: () => inputWrapper[Symbol.asyncIterator](),
    close: () => {
      inputWrapper.close();
      outputWrapper.close();
    },
  };

  const output: ConnNext = {
    remoteAddr: mockAddr,
    localAddr: mockAddr,
    read: (length) => outputWrapper.read(length),
    write: (data) => outputWrapper.write(data),
    [Symbol.asyncIterator]: () => outputWrapper[Symbol.asyncIterator](),
    close: () => {
      outputWrapper.close();
      inputWrapper.close();
    },
  };

  return { input, output };
}
