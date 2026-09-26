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

/**
 * TCP server that wraps a MqttServer, see the /examples folder
 */
export class TcpServer {
  private mqttServer: MqttServer;
  private server?: Server;
  private serverOptions;

  /**
   * Create a new TCP server
   */
  constructor(serverOptions: ServerOptions, mqttOptions: MqttServerOptions) {
    this.mqttServer = new MqttServer(mqttOptions);
    this.serverOptions = serverOptions;
  }

  /**
   * Start listening
   */
  async start(): Promise<void> {
    this.server = createServer((sock) =>
      this.mqttServer.serve(wrapNodeSocket(sock))
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

  /**
   * Stop listening
   */
  stop(): void {
    this.mqttServer.close();
    this.server?.close();
  }

  /**
   * The port number the server is listening on
   */
  get port(): number | undefined {
    const address = this.server?.address();
    // deno-coverage-ignore-start
    if (typeof address === "object" && address !== null) {
      return address?.port;
    }
    return this.serverOptions?.port;
    // deno-coverage-ignore-stop
  }

  /**
   * The address the server is listening on
   */
  get address(): string | undefined {
    const addressResult = this.server?.address();
    // deno-coverage-ignore-start
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
  // deno-coverage-ignore-stop
}
