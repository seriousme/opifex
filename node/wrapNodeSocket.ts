/**
 * Utility functions for wrapping Node.js sockets into standard web streams.
 */
import type { Socket } from "node:net";
import { Writable } from "node:stream";
import type { NetAddr, SockConn } from "../socket/socket.ts";
/**
 * Closes a Node.js socket if it is not already closed
 * @param sock - The Node.js socket to close
 */
function closer(sock: Socket): void {
  if (!sock.closed) {
    sock.end();
  }
}

/**
 * Wraps a Node.js socket into a standard web streams-based socket connection
 * @param socket - The Node.js socket to wrap
 * @returns A socket connection object with readable/writable streams and close method
 */
export function wrapNodeSocket(socket: Socket): SockConn {
  const readable = new ReadableStream(
    {
      type: "bytes",
      start(controller) {
        socket.on("data", (data: ArrayBufferView) => {
          controller.enqueue(data);
          const desiredSize = controller.desiredSize ?? 0;
          if (desiredSize <= 0) {
            // The internal queue is full, so propagate
            // the backpressure signal to the underlying source.
            socket.pause();
          }
        });
        socket.on("error", (err: unknown) => controller.error(err));
        socket.on("end", () => {
          // close the controller
          controller.close();
          // and unlock the last BYOB read request
          controller.byobRequest?.respond(0);
        });
      },
      pull: () => {
        socket.resume();
      },
      cancel: () => {
        socket.end();
      },
    },
  );
  const writable = Writable.toWeb(socket);
  const remoteAddr: NetAddr = {
    hostname: socket.remoteAddress || "",
    port: socket.remotePort || 0,
    transport: "tcp",
  };

  const conn: SockConn = {
    readable: readable as ReadableStream<Uint8Array>,
    writable: writable as WritableStream<Uint8Array>,
    close: () => closer(socket),
    remoteAddr,
  };
  return conn;
}
