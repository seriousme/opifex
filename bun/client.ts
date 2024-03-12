import { Client } from "../client/client.ts";
import { logger } from "../client/deps.ts";
import { socket2conn } from "./conn.ts";
import { SockConn } from "../socket/socket.ts";

export async function getCaCerts(filename: string | undefined) {
  if (!filename) {
    return;
  }
  const file = Bun.file(filename);
  const caCerts = await file.text();
  if (caCerts === "") {
    return;
  }
  return [caCerts];
}

function bunConnect(
  hostname: string,
  port: number,
  tls = false,
): Promise<SockConn> {
  return new Promise((resolve, _reject) => {
    Bun.connect({
      hostname,
      port,
      tls,
      socket: {
        open(socket) {
          resolve(socket2conn(socket));
        },
        data(socket, data) {
          socket.data.controller.enqueue(data);
        },
        close(socket) {
          socket.data.conn.close();
        },
      },
    });
  });
}

export class TcpClient extends Client {
  protected connectMQTT(hostname: string, port = 1883) {
    logger.debug({ hostname, port });
    return bunConnect(hostname, port);
  }

  protected connectMQTTS(
    hostname: string,
    port = 8883,
    caCerts?: string[],
  ) {
    logger.debug({ hostname, port, caCerts });
    return bunConnect(hostname, port, true);
  }

  protected createConn(
    protocol: string,
    hostname: string,
    port?: number,
    caCerts?: string[],
  ): Promise<SockConn> {
    // if you need to support alternative connection types just
    // overload this method in your subclass
    if (protocol === "mqtts:") {
      return this.connectMQTTS(hostname, port, caCerts);
    }
    if (protocol === "mqtt:") {
      return this.connectMQTT(hostname, port);
    }
    throw `Unsupported protocol: ${protocol}`;
  }
}
