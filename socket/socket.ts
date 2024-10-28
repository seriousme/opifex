export type SockAddr = NetAddr | UnixAddr | undefined;
export interface NetAddr {
  transport?: "tcp" | "udp";
  hostname: string;
  port: number;
}

export interface UnixAddr {
  transport: "unix" | "unixpacket";
  path: string;
}

export type SockConn = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  closer: () => void;
  localAddr?: SockAddr;
  remoteAddr?: SockAddr;
};

export class Conn {
  reader: ReadableStreamBYOBReader;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  closed: boolean;
  remoteAddr: SockAddr | undefined;
  closer: () => void;

  constructor(sockConn: SockConn) {
    this.closed = false;
    this.reader = sockConn.readable.getReader({ mode: "byob" });
    this.writer = sockConn.writable.getWriter();
    this.closer = sockConn.closer;
    this.remoteAddr = sockConn.remoteAddr;
  }

  async read(buff: Uint8Array): Promise<number | null> {
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
      this.closer();
    }
  }
}
