/**
 * This module provides a Deno specific implementation of a TCP socket listener
 * it uses the platform agnostic MqttServer class
 *  @module
 */

import { MqttServer } from "../server/mod.ts";
import type { MqttServerOptions } from "../server/mod.ts";

/**
 * TCP server that wraps a MqttServer, see the /examples folder
 */
export class TcpServer {
  private listener: Deno.Listener<Deno.Conn>;
  private mqttServer: MqttServer;

  /**
   * Create a new TCP server
   */
  constructor(
    serverOptions: Deno.TcpListenOptions,
    mqttOptions: MqttServerOptions,
  ) {
    this.listener = Deno.listen(serverOptions);
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
    this.mqttServer.close(true);
    this.listener.close();
  }

  /**
   * The port number the server is listening on
   */
  get port(): number | undefined {
    // deno-coverage-ignore-start
    if (this.listener.addr.transport === "tcp") {
      return this.listener.addr.port;
    }
    return undefined;
    // deno-coverage-ignore-stop
  }

  /**
   * The address the server is listening on
   */
  get address(): string | undefined {
    // deno-coverage-ignore-start
    if (this.listener.addr.transport === "tcp") {
      return this.listener.addr.hostname;
    }
    return undefined;
    // deno-coverage-ignore-stop
  }
}
