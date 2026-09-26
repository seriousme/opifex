/** Net addresses */
export type NetAddr = {
  /** The IP-based transport protocol */
  transport: "tcp" | "udp";
  /** The hostname */
  hostname: string;
  /** The port number */
  port: number;
};
/** Unix addresses */
export type UnixAddr = {
  /** The Unix domain socket transport protocol */
  transport: "unix" | "unixpacket";
  /** The file system path to the socket to connect to */
  path: string;
};
/** vSock addresses */
export type VsockAddr = {
  /** The VSOCK transport protocol */
  transport: "vsock";
  /** The context identifier (CID) of the peer */
  cid: number;
  /** The port number */
  port: number;
};
/** Socket addresses */
export type SockAddr = NetAddr | UnixAddr | VsockAddr;
/** Socket connection descriptor. */
export type SockConn = {
  /** The stream to read from */
  readable: ReadableStream<Uint8Array>;
  /** The stream to write to */
  writable: WritableStream<Uint8Array>;
  /** The callback to call on close */
  close: () => void;
  /** The local address of the connection */
  localAddr?: SockAddr;
  /** The remote address of the connection */
  remoteAddr?: SockAddr;
};

/** Connection class */
export class Conn {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  closed: boolean;
  remoteAddr: SockAddr | undefined;
  closer: () => void;

  private leftover: Uint8Array = new Uint8Array(0);

  /** Create a new Conn object from a SockConn */
  constructor(sockConn: SockConn) {
    this.closed = false;
    this.reader = sockConn.readable.getReader();
    this.writer = sockConn.writable.getWriter();
    this.closer = sockConn.close.bind(sockConn);
    this.reader.closed.catch(() => {});
    this.writer.closed.catch(() => {});
    this.remoteAddr = sockConn.remoteAddr;
  }

  /** Read bytes from the connection */
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
        return null;
      }
    }
    return result;
  }

  /** Write bytes to the connection */
  async write(data: Uint8Array): Promise<number> {
    if (this.closed) {
      return Promise.reject(new Error("Connection closed"));
    }
    try {
      await this.writer.write(data);
      return data.length;
    } catch (err) {
      this.closed = true;
      throw err;
    }
  }

  /** close the connection */
  close() {
    if (!this.closed) {
      this.closed = true;

      // deno-coverage-ignore-start
      void this.writer.close().catch(() => {
        // ignore duplicate/late close attempts; the stream may already be closed
      });
      // deno-coverage-ignore-stop

      try {
        void this.reader.cancel().catch(() => {
          // ignore duplicate/late cancel attempts; the stream may already be closed
        });
        this.reader?.releaseLock();
        // deno-coverage-ignore
      } catch (_err) { /* swallow */ }

      try {
        this.closer();
      } catch (_err) { /* swallow */ }
    }
  }
}
