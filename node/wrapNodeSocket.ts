import type { Socket } from "node:net";
import { Writable } from "node:stream";
import type { SockConn } from "../socket/socket.ts";

function closer(sock: Socket) {
  if (!sock.closed) {
    sock.end();
  }
}

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
  const remoteAddr = {
    hostname: socket.remoteAddress || "",
    port: socket.remotePort || 0,
  };

  const conn: SockConn = {
    readable: readable as ReadableStream<Uint8Array>,
    writable: writable as WritableStream<Uint8Array>,
    closer: () => closer(socket),
    remoteAddr,
  };
  return conn;
}
