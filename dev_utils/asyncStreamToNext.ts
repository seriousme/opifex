import type { ConnAddr, ConnNext } from "../connNext/connNext.ts";
import { createAsyncStreamPair } from "./asyncStreamPair.ts";
import type { AsyncStreamPairEndpoint } from "./asyncStreamPair.ts";

/** wrapper class */
export class AsyncStreamConnNextWrapper {
  closed: boolean;
  private endPoint: AsyncStreamPairEndpoint;
  private leftover: Uint8Array = new Uint8Array(0);
  private reader: AsyncIterator<Uint8Array>;

  /** Create a new ConnNext object from a SockConn */
  constructor(endPoint: AsyncStreamPairEndpoint) {
    this.endPoint = endPoint;
    this.closed = false;
    this.reader = endPoint.readable[Symbol.asyncIterator]();
  }

  /**
   * Writes data chunk to the underlying AsyncStream
   */ async write(chunk: Uint8Array): Promise<void> {
    if (this.closed) {
      return Promise.reject(new Error("Pipe closed"));
    }
    try {
      await this.endPoint.write(chunk);
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
    if (this.closed || (length !== undefined && length < 0)) {
      return null;
    }

    if (length === 0) {
      return new Uint8Array(0);
    }

    // Helper to fetch the next chunk from the underlying iterable
    const fetchNextChunk = async (): Promise<Uint8Array | null> => {
      const { value, done } = await this.reader.next();
      if (done) {
        this.closed = true;
        return null;
      }
      return value;
    };

    // Unbounded read (length === undefined)
    if (length === undefined) {
      if (this.leftover.length > 0) {
        const result = this.leftover;
        this.leftover = new Uint8Array(0);
        return result;
      }
      return await fetchNextChunk();
    }

    // Exact length read
    const bytesRequested = length;
    const result = new Uint8Array(bytesRequested);
    let bytesAccumulated = 0;

    // Use leftover data first if available
    if (this.leftover.length > 0) {
      const take = Math.min(this.leftover.length, bytesRequested);
      result.set(this.leftover.subarray(0, take), bytesAccumulated);
      bytesAccumulated += take;
      this.leftover = this.leftover.subarray(take);
    }

    // Read remaining required bytes
    while (bytesAccumulated < bytesRequested) {
      const value = await fetchNextChunk();

      if (value === null) {
        // Stream ended before collecting required bytes
        if (bytesAccumulated === 0) return null;
        return result.subarray(0, bytesAccumulated);
      }

      const needed = bytesRequested - bytesAccumulated;

      if (value.length <= needed) {
        result.set(value, bytesAccumulated);
        bytesAccumulated += value.length;
      } else {
        result.set(value.subarray(0, needed), bytesAccumulated);
        bytesAccumulated += needed;
        this.leftover = value.subarray(needed);
      }
    }

    return result;
  }

  /**
   * Closes the reader, writer, and underlying AsyncStream pair endpoint.
   */
  close(): void {
    if (!this.closed) {
      this.closed = true;
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
 * Creates a pair of cross-connected ConnNext sockets backed by AsyncStreams.
 * Offers the exact same API as `createConnNextPair`.
 */
export function createConnNextPair(): {
  input: ConnNext;
  output: ConnNext;
} {
  const { input: asyncInput, output: asyncOutput } = createAsyncStreamPair();

  const mockAddr: ConnAddr = {
    transport: "tcp",
    hostname: "127.0.0.1",
    port: 1883,
  };

  const inputWrapper = new AsyncStreamConnNextWrapper(asyncInput);
  const outputWrapper = new AsyncStreamConnNextWrapper(asyncOutput);

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
