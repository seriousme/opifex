/**
 * This a Deno specific implementation of a WebSocket server
 * @module
 */
import { MqttServer } from "../server/mod.ts";
import type { MqttServerOptions } from "../server/mod.ts";
import { logger } from "../utils/logger.ts";
import { webSocketToNext } from "../web/webSocketToNext.ts";
import type { NetAddr } from "../connNext/connNext.ts";

/** for those who want wrap their own websockets */
export { webSocketToNext };
export type RequestHandler = (
  req: Request,
  info: Deno.ServeHandlerInfo<NetAddr>,
) => Response | Promise<Response>;

export const pageNotFound: RequestHandler = (_req, _info) => {
  return new Response("Page not found", { status: 404 });
};

async function handleWsClient(
  socket: WebSocket,
  mqttServer: MqttServer,
  remoteAddr: NetAddr,
) {
  const conn = await webSocketToNext(socket, remoteAddr);
  mqttServer.serve(conn);
  logger.debug("serving mqtt");
}

export function mqttOverWS(
  mqttServer: MqttServer,
  pathName: string,
  next: RequestHandler,
): RequestHandler {
  const wsRequestHandler: RequestHandler = (req, info) => {
    const url = new URL(req.url);
    if (url.pathname === pathName) {
      if (req.headers.get("upgrade") !== "websocket") {
        return new Response("Expected WebSocket connection.", { status: 426 });
      }
      logger.debug("starting upgrade to websocket");
      const remoteAddr = info.remoteAddr;
      const { socket, response } = Deno.upgradeWebSocket(req);
      logger.debug("upgraded to websocket");
      // do not await on purpose
      handleWsClient(socket, mqttServer, remoteAddr);
      return response;
    }
    return next(req, info);
  };
  return wsRequestHandler;
}

/**
 * WebSocket server that wraps a MqttServer, see the /examples folder
 */
export class WsServer {
  /** the MqttServer instance used by the server */
  readonly mqttServer: MqttServer;
  private server?: Deno.HttpServer;
  private listenOptions: Deno.ServeOptions & {
    port: number;
    hostname?: string;
  };
  private pathName: string;

  /**
   * Create a new WebSocket server
   */
  constructor(
    serverOptions: Deno.ServeOptions & {
      port: number;
      hostname?: string;
      pathName?: string;
    },
    mqttOptions: MqttServerOptions | MqttServer,
  ) {
    const { pathName, ...listenOptions } = serverOptions;
    this.listenOptions = listenOptions;
    this.pathName = pathName ?? "/mqtt";
    if (mqttOptions instanceof MqttServer) {
      this.mqttServer = mqttOptions;
    } else {
      this.mqttServer = new MqttServer(mqttOptions);
    }
  }

  /**
   * Start listening
   */
  async start(): Promise<void> {
    const requestHandler = mqttOverWS(
      this.mqttServer,
      this.pathName,
      pageNotFound,
    );
    this.server = Deno.serve(this.listenOptions, requestHandler);
    await this.server.finished;
  }

  /**
   * Stop listening
   */
  async stop(opts = { closeMqtt: true }): Promise<void> {
    if (opts.closeMqtt) {
      await this.mqttServer.close();
    }
    if (this.server) {
      this.server.shutdown();
    }
  }

  /**
   * The port number the server is listening on
   */
  get port(): number | undefined {
    // deno-coverage-ignore-start
    if (this.server?.addr.transport === "tcp") {
      return this.server.addr.port;
    }
    return undefined;
    // deno-coverage-ignore-stop
  }

  /**
   * The address the server is listening on
   */
  get address(): string | undefined {
    // deno-coverage-ignore-start
    if (this.server?.addr.transport === "tcp") {
      return this.server.addr.hostname;
    }
    return undefined;
    // deno-coverage-ignore-stop
  }
}
