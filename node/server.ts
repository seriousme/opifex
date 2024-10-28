import type { Server } from "node:net";
import { createServer } from "node:net";
import type { MqttServerOptions } from "../server/mod.ts";
import { MqttServer } from "../server/mod.ts";
import { wrapNodeSocket } from "./wrapNodeSocket.ts";

type ServerOptions = {
  hostname?: string;
  port?: number;
};

export class TcpServer {
  private mqttServer: MqttServer;
  private server?: Server;
  private serverOptions;
  constructor(serverOptions: ServerOptions, mqttOptions: MqttServerOptions) {
    this.mqttServer = new MqttServer(mqttOptions);
    this.serverOptions = serverOptions;
  }

  start() {
    this.server = createServer((sock) =>
      this.mqttServer.serve(wrapNodeSocket(sock))
    );
    this.server.listen(this.serverOptions.port, this.serverOptions.hostname);
  }
  stop() {
    this.server?.close();
  }

  get port() {
    return this.serverOptions.port;
  }
}
