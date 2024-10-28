import type { Socket } from "node:net";
import { Duplex } from "node:stream";
import type { SockConn } from "../socket/socket.ts";

export function wrapNodeSocket(sock: Socket): SockConn {
  const { readable, writable } = Duplex.toWeb(sock);
  const remoteAddr = {
    hostname: sock.remoteAddress || "",
    port: sock.remotePort || 0,
  };

  const conn: SockConn = {
    readable: readable as ReadableStream<Uint8Array>,
    writable: writable as WritableStream<Uint8Array>,
    closer: sock.end,
    remoteAddr,
  };
  return conn;
}
