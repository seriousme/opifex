/**
 * this is a WebSockets specific client
 * it extends the platform agnostic Client class
 *  @module
 */

import { Client } from "../client/client.ts";
import { logger } from "../client/deps.ts";
import type { ConnNext, NetAddr } from "../client/deps.ts";
import { webSocketToNext } from "./webSocketToNext.ts";

/**
 * WsClient extends the Client class to provide WebSocket based clients
 * it is used by the MQTTclient to connect to the broker
 * see the /examples folder for an example
 */
export class WsClient extends Client {
  /** create a websocket and wrap it in a ConnNext */
  private async establishSocket(url: string): Promise<ConnNext> {
    try {
      const urlObj = new URL(url);
      const remoteAddr: NetAddr = {
        transport: "tcp",
        hostname: urlObj.hostname,
        port: Number(urlObj.port || 0),
      };
      const ws = new WebSocket(url);
      const connNext = await webSocketToNext(ws, remoteAddr);
      return connNext;
    } catch (error) {
      const message = error instanceof ErrorEvent
        ? ` because of ${error.message}`
        : "";
      throw new Error(`Failed to connect to WebSocket at ${url}${message}`);
    }
  }

  /** createConn provides support for both "ws:" and "wss:" URLs */
  protected override createConn(): Promise<ConnNext> {
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
