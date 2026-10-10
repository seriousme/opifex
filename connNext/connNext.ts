/** Net addresses */
export type NetAddr = {
  /** the IP-based transport protocol */
  transport: "tcp" | "udp";
  /** the hostname */
  hostname: string;
  /** the port number */
  port: number;
};
/** Unix addresses */
export type UnixAddr = {
  /** the Unix domain socket transport protocol */
  transport: "unix" | "unixpacket";
  /** the file system path to the socket to connect to */
  path: string;
};
/** vSock addresses */
export type VsockAddr = {
  /** the VSOCK transport protocol */
  transport: "vsock";
  /** the context identifier (CID) of the peer */
  cid: number;
  /** the port number */
  port: number;
};

/** connection addresses */
export type ConnAddr = NetAddr | UnixAddr | VsockAddr | undefined;
/** connection descriptor. */

export type ConnNext = {
  /** the "nextStream" to read from */
  read(length?: number): Promise<Uint8Array | null>;
  /** the "nextStream" to write to */
  write(data: Uint8Array): Promise<void>;
  /** close the connection */
  close(): void;
  /** Async Iterator for streaming per chunck */
  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array>;
  /** The local address of the connection */
  localAddr?: ConnAddr;
  /** The remote address of the connection */
  remoteAddr?: ConnAddr;
};
