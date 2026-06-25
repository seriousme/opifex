/**
 * This module provides a Deno specific implementation of a TCP socket listener
 * it uses the platform agnostic MqttServer class
 *  @module
 */

import { MqttServer } from "../server/mod.ts";
import type { MqttServerOptions } from "../server/mod.ts";

/*
 * TCP server that wraps a MqttServer, see demoServer.ts in the /bin folder
 */
export class TlsServer {
  private listener: Deno.TlsListener;
  private mqttServer: MqttServer;
  constructor(
    serverOptions: Deno.ListenTlsOptions & Deno.TlsCertifiedKeyPem,
    mqttOptions: MqttServerOptions,
  ) {
    this.listener = Deno.listenTls(serverOptions);
    this.mqttServer = new MqttServer(mqttOptions);
  }

  async start() {
    for await (const conn of this.listener) {
      this.mqttServer.serve(conn);
    }
  }
  stop() {
    this.mqttServer.close();
    this.listener.close();
  }
  // deno-coverage-ignore-start
  get port(): number | undefined {
    return this.listener.addr.port;
  }

  get address(): string | undefined {
    return this.listener.addr.hostname;
  }
  // deno-coverage-ignore-stop
}
