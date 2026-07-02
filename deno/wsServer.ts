import { MqttServer } from "../server/mod.ts";
import type { MqttServerOptions } from "../server/mod.ts";
import { logger } from "../utils/logger.ts";
import { wrapWebSocket } from "../web/wrapWebSocket.ts";
import type { HostnamePort } from "../web/wrapWebSocket.ts";

export class WsServer {
  private server?: Deno.HttpServer;
  private mqttServer: MqttServer;
  private listenOptions: Deno.ServeOptions & {
    port: number;
    hostname?: string;
  };

  constructor(
    serverOptions: Deno.ServeOptions & { port: number; hostname?: string },
    mqttOptions: MqttServerOptions,
  ) {
    this.listenOptions = serverOptions;
    this.mqttServer = new MqttServer(mqttOptions);
  }
  private async handleWsClient(socket: WebSocket, remoteAddr: HostnamePort) {
    const conn = await wrapWebSocket(socket, remoteAddr);
    logger.debug("created conn");
    this.mqttServer.serve(conn);
    logger.debug("serving mqtt");
  }

  async start(): Promise<void> {
    this.server = Deno.serve(this.listenOptions, (req, info) => {
      const { hostname, port } = info.remoteAddr;
      logger.debug(
        `Server received http connection from ${hostname}:${port}`,
      );

      if (req.headers.get("upgrade") !== "websocket") {
        return new Response("Expected WebSocket connection.", { status: 426 });
      }
      logger.debug("starting upgrade to websocket");
      const { socket, response } = Deno.upgradeWebSocket(req);
      logger.debug("upgraded to websocket");
      this.handleWsClient(socket, { hostname, port });
      return response;
    });

    await this.server.finished;
  }

  stop(): void {
    this.mqttServer.close(true);
    if (this.server) {
      this.server.shutdown();
    }
  }

  get port(): number | undefined {
    // deno-coverage-ignore-start
    if (this.server?.addr.transport === "tcp") {
      return this.server.addr.port;
    }
    return undefined;
    // deno-coverage-ignore-stop
  }

  get address(): string | undefined {
    // deno-coverage-ignore-start
    if (this.server?.addr.transport === "tcp") {
      return this.server.addr.hostname;
    }
    return undefined;
    // deno-coverage-ignore-stop
  }
}
