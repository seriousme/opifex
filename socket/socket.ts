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
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close: () => void;
  localAddr?: SockAddr;
  remoteAddr?: SockAddr;
};

export class Conn {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  closed: boolean;
  remoteAddr: SockAddr | undefined;
  closer: () => void;

  private leftover: Uint8Array = new Uint8Array(0);

  constructor(sockConn: SockConn) {
    this.closed = false;
    this.reader = sockConn.readable.getReader();
    this.writer = sockConn.writable.getWriter();
    this.closer = sockConn.close.bind(sockConn);
    this.remoteAddr = sockConn.remoteAddr;
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
    if (this.leftover.length > 0) {
      const take = Math.min(this.leftover.length, length);
      result.set(this.leftover.subarray(0, take), bytesAccumulated);
      bytesAccumulated += take;
      this.leftover = this.leftover.subarray(take);
    }

    // Keep readin until we have enough data
    while (bytesAccumulated < length) {
      const { value, done } = await this.reader.read();

      if (value) {
        const needed = length - bytesAccumulated;

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
        if (bytesAccumulated < length) {
          return null;
        }
        // We had enough data, return that data
        break;
      }
    }
    return result;
  }

  write(data: Uint8Array): Promise<number> {
    if (this.closed) {
      return Promise.reject(new Error("Connection closed"));
    }
    this.writer.write(data);
    return Promise.resolve(data.length);
  }

  close() {
    if (!this.closed) {
      try {
        this.writer.close();
      } catch (_err) { /* swallow */ }
      try {
        this.reader.releaseLock();
      } catch (_err) { /* swallow */ }
      this.closed = true;
      try {
        this.closer();
      } catch (_err) { /* swallow */ }
    }
  }
}
