/*
 * This module provides a NodeJS specific implementation of a tls socket listener
 * it uses the platform agnostic MqttServer class
 *  @module
 */
import type { Server } from "node:net";
import { createServer } from "node:tls";
import type { MqttServerOptions } from "../server/mod.ts";
import { MqttServer } from "../server/mod.ts";
import { wrapNodeSocket } from "./wrapNodeSocket.ts";

type ServerOptions = {
  hostname?: string;
  port?: number;
  key: string;
  cert: string;
};

/*
 * TCP server that wraps a MqttServer, see demoServer.ts in the /bin folder
 */
export class TlsServer {
  private mqttServer: MqttServer;
  private server?: Server;
  private serverOptions;

  constructor(serverOptions: ServerOptions, mqttOptions: MqttServerOptions) {
    this.mqttServer = new MqttServer(mqttOptions);
    this.serverOptions = serverOptions;
  }

  async start() {
    const tlsOptions = {
      minVersion: "TLSv1.3" as const,
      key: this.serverOptions.key,
      cert: this.serverOptions.cert,
    };

    this.server = createServer(
      tlsOptions,
      (sock) => this.mqttServer.serve(wrapNodeSocket(sock)),
    );
    const isListening = new Promise((resolve) => {
      this.server?.on("listening", () => {
        resolve(true);
      });
    });
    this.server.listen(this.serverOptions.port, this.serverOptions.hostname);
    await isListening;
    return;
  }
  stop() {
    this.server?.close();
  }

  get port() {
    const address = this.server?.address();
    if (typeof address === "object" && address !== null) {
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
