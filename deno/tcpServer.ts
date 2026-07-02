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
export class TcpServer {
  private listener: Deno.Listener<Deno.Conn>;
  private mqttServer: MqttServer;
  constructor(
    serverOptions: Deno.TcpListenOptions,
    mqttOptions: MqttServerOptions,
  ) {
    this.listener = Deno.listen(serverOptions);
    this.mqttServer = new MqttServer(mqttOptions);
  }

  async start() {
    for await (const conn of this.listener) {
      this.mqttServer.serve(conn);
    }
  }
  stop() {
    this.mqttServer.close(true);
    this.listener.close();
  }

  get port(): number | undefined {
    // deno-coverage-ignore-start
    if (this.listener.addr.transport === "tcp") {
      return this.listener.addr.port;
    }
    return undefined;
    // deno-coverage-ignore-stop
  }

  get address(): string | undefined {
    // deno-coverage-ignore-start
    if (this.listener.addr.transport === "tcp") {
      return this.listener.addr.hostname;
    }
    return undefined;
    // deno-coverage-ignore-stop
  }
}
