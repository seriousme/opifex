import type { SockConn } from "../socket/socket.ts";

export function wrapDenoConn(denoConn: Deno.Conn) {
  const conn: SockConn = {
    readable: denoConn.readable,
    writable: denoConn.writable,
    closer: denoConn.close.bind(denoConn),
    localAddr: denoConn.localAddr,
    remoteAddr: denoConn.remoteAddr,
  };
  return conn;
}
