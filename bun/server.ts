import { MqttServer, MqttServerOptions } from "../server/mod.ts";
import { socket2conn } from "./conn.ts";

export class TcpServer {
  private listener: Bun.Listener<Bun.Conn>;
  private mqttServer: MqttServer;
  serverOptions: Bun.TcpListenOptions;
  constructor(
    serverOptions: Bun.TcpListenOptions,
    mqttOptions: MqttServerOptions,
  ) {
    this.serverOptions = serverOptions;
    this.mqttServer = new MqttServer(mqttOptions);
  }

  start() {
    const mqttServer = this.mqttServer;
    this.listener = Bun.listen({
      ...this.serverOptions,
      socket: {
        open(socket) {
          mqttServer.serve(socket2conn(socket));
        },
        data(socket, data) {
          socket.data.controller.enqueue(data);
        },
        close(socket) {
          socket.data.conn.close();
        },
      },
    });
  }
  stop() {
    this.listener.stop();
  }

  get port() {
    return this.listener.port;
  }
}
