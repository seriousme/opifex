export type SockAddr = NetAddr | UnixAddr;
export interface NetAddr {
  transport: "tcp" | "udp";
  hostname: string;
  port: number;
}

export interface UnixAddr {
  transport: "unix" | "unixpacket";
  path: string;
}

export type SockConn = {
  readable?: ReadableStream<Uint8Array>;
  writable?: WritableStream<Uint8Array>;
  read: (p: Uint8Array) => Promise<number | null>;
  write: (p: Uint8Array) => Promise<number>;
  close: () => void;
  remoteAddr?: Deno.Addr;
};
