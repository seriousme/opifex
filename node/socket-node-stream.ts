import type { Duplex } from "node:stream";

export type SockAddr = NetAddr | UnixAddr | VsockAddr;
export interface NetAddr {
  transport: "tcp" | "udp";
  hostname: string;
  port: number;
}
export interface UnixAddr {
  transport: "unix" | "unixpacket";
  path: string;
}
export interface VsockAddr {
  transport: "vsock";
  cid: number;
  port: number;
}

export type SockConn = {
  stream: Duplex;
  close: () => void;
  localAddr?: SockAddr;
  remoteAddr?: SockAddr;
};

export class Conn {
  private stream: Duplex;
  private closed: boolean;
  private closer: () => void;
  public remoteAddr: SockAddr | undefined;
  private leftover: Uint8Array = new Uint8Array(0);

  // Store bound event listeners so we can cleanly remove them later
  private onStreamClose = () => {
    this.closed = true;
  };
  private onStreamError = () => {
    this.closed = true;
  };

  constructor(sockConn: SockConn) {
    this.stream = sockConn.stream;
    this.closed = false;
    this.closer = sockConn.close;
    this.remoteAddr = sockConn.remoteAddr;

    // Attach listeners to update internal state on stream termination
    this.stream.on("close", this.onStreamClose);
    this.stream.on("error", this.onStreamError);
  }

  async read(length: number): Promise<Uint8Array | null> {
    if (this.closed || length < 0) {
      return null;
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
      if (this.closed || !this.stream.readable) {
        break;
      }

      const chunk = this.stream.read();
      if (chunk === null) {
        await new Promise<void>((resolve) => {
          const cleanup = () => {
            this.stream.off("readable", onEvent);
            this.stream.off("end", onEvent);
            this.stream.off("error", onEvent);
            this.stream.off("close", onEvent);
          };
          const onEvent = () => {
            cleanup();
            resolve();
          };

          this.stream.on("readable", onEvent);
          this.stream.on("end", onEvent);
          this.stream.on("error", onEvent);
          this.stream.on("close", onEvent);
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

  write(data: Uint8Array): Promise<number> {
    if (this.closed || !this.stream.writable) {
      return Promise.reject(new Error("Stream is closed or not writable"));
    }

    return new Promise((resolve, reject) => {
      // 1. Fire the write command and catch any immediate/async errors via the callback
      const canWriteMore = this.stream.write(data, (err) => {
        if (err) {
          reject(err);
        }
      });

      // 2. Determine when to resolve based on the return value of write()
      if (canWriteMore) {
        // If the buffer is not full, we can resolve immediately
        resolve(data.length);
      } else {
        // If backpressure is triggered, we must wait for the 'drain' event
        this.stream.once("drain", () => {
          resolve(data.length);
        });
      }
    });
  }

  close() {
    if (!this.closed) {
      this.closed = true;

      // Clean up permanent event listeners to prevent memory leaks
      this.stream.off("close", this.onStreamClose);
      this.stream.off("error", this.onStreamError);

      // Safely destroy the stream first, then trigger the closer callback
      try {
        this.stream.destroy();
        // deno-coverage-ignore
      } catch (_) {
        // Suppress stream destruction errors
        // deno-coverage-ignore
      }

      try {
        this.closer();
        // deno-coverage-ignore
      } catch (_) {
        // Prevent closer failures from crashing the thread
        // deno-coverage-ignore
      }
    }
  }
}
