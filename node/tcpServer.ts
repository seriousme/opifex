/*
 * This module provides a NodeJS specific implementation of a TCP socket listener
 * it uses the platform agnostic MqttServer class
 *  @module
 */
import type { Server } from "node:net";
import { createServer } from "node:net";
import type { MqttServerOptions } from "../server/mod.ts";
import { MqttServer } from "../server/mod.ts";
import { wrapNodeSocket } from "./wrapNodeSocket.ts";

type ServerOptions = {
  hostname?: string;
  port?: number;
};

/*
 * TCP server that wraps a MqttServer, see demoServer.ts in the /bin folder
 */
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
    const address = this.server?.address();
    if (typeof address === "object") {
      return address?.port;
    }
    return this.serverOptions?.port;
  }

  get address() {
    const addressResult = this.server?.address();
    if (typeof addressResult === "object") {
      const address = addressResult?.address;
      if (address === "::") {
        return "localhost";
      }
      if (address?.includes(":")) {
        return `[${address}]`;
      }
      return address;
    }
    return addressResult;
  }
}
