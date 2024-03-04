import { MqttServer, MqttServerOptions } from "../server/mod.ts";

export class DenoServer {
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
    this.listener.close();
  }

  get port() {
    if (this.listener.addr.transport === "tcp") {
      return this.listener.addr.port;
    }
    return undefined;
  }
}
