import type { Socket } from "node:net";
import type { ConnAddr, ConnNext } from "../connNext/connNext.ts"; // Custom types

/** wrapper class */
export class NodeSocketConnNextWrapper {
  private endPoint: Socket;
  private closed: boolean;
  private leftover: Uint8Array = new Uint8Array(0);

  // Store bound event listeners so we can cleanly remove them later
  private onClose = () => {
    this.closed = true;
  };
  private onError = () => {
    this.closed = true;
  };

  /** Create a new ConnNext object from a Webstream */
  constructor(endPoint: Socket) {
    this.endPoint = endPoint;
    this.closed = false;
    this.endPoint;
  }

  async read(length?: number): Promise<Uint8Array | null> {
    if (this.closed || (length ?? 0) < 0) {
      return null;
    }

    // If no specific byte length is requested, read whatever is available
    if (length === undefined) {
      const chunk = this.endPoint.read();
      return chunk
        ? Promise.resolve(
          new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength),
        )
        : Promise.resolve(null);
    }

    if (length === 0) {
      return new Uint8Array(0);
    }

    const result = new Uint8Array(length);
    let bytesAccumulated = 0;

    // 1. Process leftover data from the previous read operation
    if (this.leftover.byteLength > 0) {
      const take = Math.min(this.leftover.byteLength, length);
      result.set(this.leftover.subarray(0, take), bytesAccumulated);
      bytesAccumulated += take;
      this.leftover = this.leftover.subarray(take);
    }

    // 2. Loop until the requested number of bytes is accumulated
    while (bytesAccumulated < length) {
      if (this.closed || !this.endPoint.readable) {
        break;
      }

      const chunk = this.endPoint.read();
      if (chunk === null) {
        await new Promise<void>((resolve) => {
          const cleanup = () => {
            this.endPoint.off("readable", onEvent);
            this.endPoint.off("end", onEvent);
            this.endPoint.off("error", onEvent);
            this.endPoint.off("close", onEvent);
          };
          const onEvent = () => {
            cleanup();
            resolve();
          };

          this.endPoint.on("readable", onEvent);
          this.endPoint.on("end", onEvent);
          this.endPoint.on("error", onEvent);
          this.endPoint.on("close", onEvent);
        });

        continue;
      }

      // 3. Process the retrieved chunk
      const chunkLength = chunk.byteLength;
      const needed = length - bytesAccumulated;

      if (chunkLength <= needed) {
        result.set(chunk, bytesAccumulated);
        bytesAccumulated += chunkLength;
      } else {
        result.set(chunk.subarray(0, needed), bytesAccumulated);
        bytesAccumulated += needed;
        this.leftover = chunk.subarray(needed);
      }
    }

    if (bytesAccumulated < length) {
      return null;
    }

    return result;
  }

  write(data: Uint8Array): Promise<void> {
    if (this.closed || !this.endPoint.writable) {
      return Promise.reject(new Error("Stream is closed or not writable"));
    }

    return new Promise((resolve, reject) => {
      // 1. Fire the write command and catch any immediate/async errors via the callback
      const canWriteMore = this.endPoint.write(data, (err) => {
        if (err) {
          reject(err);
        }
      });

      // 2. Determine when to resolve based on the return value of write()
      if (canWriteMore) {
        // If the buffer is not full, we can resolve immediately
        resolve();
      } else {
        // If backpressure is triggered, we must wait for the 'drain' event
        this.endPoint.once("drain", () => {
          resolve();
        });
      }
    });
  }

  close() {
    if (!this.closed) {
      this.closed = true;

      // Clean up permanent event listeners to prevent memory leaks
      this.endPoint.off("close", this.onClose);
      this.endPoint.off("error", this.onError);

      // Safely destroy the stream first, then trigger the closer callback
      try {
        this.endPoint.destroy();
        // deno-coverage-ignore
      } catch (_) {
        // Suppress stream destruction errors
        // deno-coverage-ignore
      }
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

  // Convert addresses to custom ConnAddr format
  get localAddr(): ConnAddr | undefined {
    if (this.endPoint.localAddress) {
      return {
        transport: "tcp",
        hostname: this.endPoint.localAddress,
        port: this.endPoint.localPort ?? 0,
      };
    }
    return undefined;
  }

  get remoteAddr(): ConnAddr | undefined {
    if (this.endPoint.remoteAddress) {
      return {
        transport: "tcp",
        hostname: this.endPoint.remoteAddress,
        port: this.endPoint.remotePort ?? 0,
      };
    }
    return undefined;
  }
}

export function nodeSocketToNext(socket: Socket): ConnNext {
  const connNext = new NodeSocketConnNextWrapper(socket);
  return connNext;
}
