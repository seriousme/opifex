/**
 * Utility functions for wrapping Node.js sockets into standard web streams.
 */
import type { Socket } from "node:net";
import { Readable, Writable } from "node:stream";
import type { NetAddr, SockConn } from "../socket/socket.ts";

/**
 * Closes a Node.js socket if it is not already closed
 * @param sock - The Node.js socket to close
 */
function closer(sock: Socket): void {
  // deno-coverage-ignore-start
  if (!sock.closed) {
    sock.end();
  }
  // deno-coverage-ignore-stop
}

/**
 * Wraps a Node.js socket into a standard web streams-based socket connection
 * @param socket - The Node.js socket to wrap
 * @returns A socket connection object with readable/writable streams and close method
 */
export function wrapNodeSocket(socket: Socket): SockConn {
  const readable = Readable.toWeb(socket);
  const writable = Writable.toWeb(socket);

  // deno-coverage-ignore-start
  const remoteAddr: NetAddr = {
    hostname: socket.remoteAddress || "",
    port: socket.remotePort || 0,
    transport: "tcp",
  };
  // deno-coverage-ignore-stop

  const conn: SockConn = {
    readable: readable as ReadableStream<Uint8Array>,
    writable: writable as WritableStream<Uint8Array>,
    close: () => closer(socket),
    remoteAddr,
  };
  return conn;
}
