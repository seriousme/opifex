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

  constructor(sockConn: SockConn) {
    this.stream = sockConn.stream;
    this.closed = false;
    this.closer = sockConn.close;
    this.remoteAddr = sockConn.remoteAddr;

    this.stream.on("close", () => {
      this.closed = true;
    });
    this.stream.on("error", () => {
      this.closed = true;
    });
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

    // Do we have data from the previous read()
    if (this.leftover.byteLength > 0) {
      const take = Math.min(this.leftover.length, length);
      result.set(this.leftover.slice(0, take), bytesAccumulated);
      bytesAccumulated += take;
      this.leftover = this.leftover.slice(take);
    }

    while (bytesAccumulated < length) {
      const remaining = length - bytesAccumulated;
      let chunk = this.stream.read(remaining);

      // if there is not enough data then await new chunks
      if (chunk === null) {
        // Check if the stream has been closed
        if (this.closed || !this.stream.readable) {
          break;
        }

        await new Promise<void>((resolve) => {
          this.stream.once("readable", resolve);
          this.stream.once("end", resolve);
        });

        // trie again after waiting
        chunk = this.stream.read(remaining);
      }

      if (chunk === null) {
        break;
      }
      const needed = length - bytesAccumulated;
      if (chunk.byteLength <= needed) {
        // We need the whole chunk
        result.set(chunk, bytesAccumulated);
        bytesAccumulated += chunk.byteLength;
      } else {
        // Chunk is bigger than what we need
        result.set(chunk.slice(0, needed), bytesAccumulated);
        bytesAccumulated += needed;
        // Save the rest for the next read() call
        this.leftover = chunk.slice(needed);
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
      this.stream.write(data, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(data.length);
        }
      });
    });
  }

  close() {
    if (!this.closed) {
      this.closed = true;
      this.closer();

      this.stream.destroy();
    }
  }
}
