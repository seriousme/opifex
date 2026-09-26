/*
 * this is a WebSockets specific client
 * it extends the platform agnostic Client class
 *  @module
 */

import { Client } from "../client/client.ts";
import { logger } from "../client/deps.ts";
import type { SockConn } from "../client/deps.ts";
import { wrapWebSocket } from "./wrapWebSocket.ts";

/**
 * WsClient extends the Client class to provide WebSocket based clients
 * it is used by the MQTTclient to connect to the broker
 * see the /examples folder for an example
 */
export class WsClient extends Client {
  /** create a websocket and wrap it in a SockConn */
  private async establishSocket(url: string): Promise<SockConn> {
    const ws = new WebSocket(url);
    const conn = await wrapWebSocket(ws);
    return conn;
  }

  /** createConn provides support for both "ws:" and "wss:" URLs */
  protected override createConn(): Promise<SockConn> {
    const { protocol, hostname, port: portStr, pathname } = this.connectUrl;
    const port = portStr ? Number(portStr) : (protocol === "wss:" ? 443 : 80);
    const path = pathname || "/mqtt";

    logger.debug({ hostname, port, path });
    if (protocol === "ws:" || protocol === "wss:") {
      return this.establishSocket(`${protocol}//${hostname}:${port}${path}`);
    }
    throw new Error(`Unsupported protocol: ${protocol}`);
  }
}
