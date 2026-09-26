/**
 * This module provides a Deno specific implementation of a TCP socket listener
 * it uses the platform agnostic MqttServer class
 *  @module
 */

import { MqttServer } from "../server/mod.ts";
import type { MqttServerOptions } from "../server/mod.ts";

/**
 * TLS server that wraps a MqttServer, see the /examples folder
 */
export class TlsServer {
  private listener: Deno.TlsListener;
  private mqttServer: MqttServer;
  /**
   * Create a new TLS server
   */
  constructor(
    serverOptions: Deno.ListenTlsOptions & Deno.TlsCertifiedKeyPem,
    mqttOptions: MqttServerOptions,
  ) {
    this.listener = Deno.listenTls(serverOptions);
    this.mqttServer = new MqttServer(mqttOptions);
  }

  /**
   * Start listening
   */
  async start(): Promise<void> {
    for await (const conn of this.listener) {
      this.mqttServer.serve(conn);
    }
  }

  /**
   * Stop listening
   */
  stop(): void {
    this.mqttServer.close();
    this.listener.close();
  }
  /**
   * The port number the server is listening on
   */
  // deno-coverage-ignore-start
  get port(): number | undefined {
    return this.listener.addr.port;
  }

  /**
   * The address the server is listening on
   */
  get address(): string | undefined {
    return this.listener.addr.hostname;
  }
  // deno-coverage-ignore-stop
}
