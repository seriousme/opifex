/**
 * Utility functions for wrapping WebSocketStream sockets into standard web streams.
 */
import { WebSocketStream } from "./webSocketStream.ts";
import type { SockConn } from "../socket/socket.ts";
import { logger } from "../utils/logger.ts";

export type HostnamePort = {
  hostname?: string;
  port?: string | number;
};

/**
 * Closes a WebSocketStream socket if it is not already closed
 * @param sock - The WebSocketStream socket to close
 */
async function closer(stream: WebSocketStream) {
  if (!await stream.closed) {
    stream.close();
  }
}

/**
 * Wraps a WebSocketStream socket into a standard web streams-based socket connection
 * @param ws - The WebSocket to wrap
 * @returns A SockConn object
 */
export async function wrapWebSocket(
  ws: WebSocket,
  remoteAddr?: HostnamePort,
): Promise<SockConn> {
  ws.binaryType = "arraybuffer";
  const wsstream = new WebSocketStream<Uint8Array>(ws);
  logger.debug("created wsstream");
  const stream = await wsstream.opened;
  logger.debug("wsstream is opened");
  const readable = stream.readable;
  const writable = stream.writable;
  const { hostname = "localhost", port = 0 } = remoteAddr || {};

  const conn: SockConn = {
    readable: readable as ReadableStream<Uint8Array>,
    writable: writable as WritableStream<Uint8Array>,
    close: () => closer(wsstream),
    remoteAddr: {
      hostname,
      port: Number(port),
      transport: "tcp",
    },
  };
  return conn;
}
