import { Client } from "../client/client.ts";
import { logger } from "../client/deps.ts";
import type { SockConn } from "../client/deps.ts";
import { wrapWebSocket } from "./wrapWebSocket.ts";

export class WsClient extends Client {
  private async establishSocket(url: string): Promise<SockConn> {
    const ws = new WebSocket(url);
    const conn = await wrapWebSocket(ws);
    return conn;
  }

  // overload createConn from the base client class
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
