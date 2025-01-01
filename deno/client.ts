// This a Deno specific implementation of TCP client sockets
// it extends the platform agnostic Client class
import { Client } from "../client/client.ts";
import { logger } from "../client/deps.ts";
import type { SockConn } from "../client/deps.ts";

export async function getCaCerts(filename: string | undefined) {
  if (!filename) {
    return;
  }
  const caCerts = await Deno.readTextFile(filename);
  if (caCerts === "") {
    return;
  }
  return [caCerts];
}

export class TcpClient extends Client {
  protected async connectMQTT(hostname: string, port = 1883) {
    logger.debug({ hostname, port });
    return await Deno.connect({ hostname, port });
  }

  protected async connectMQTTS(
    hostname: string,
    port = 8883,
    caCerts?: string[],
    cert?: string,
    key?: string,
  ) {
    logger.debug({ hostname, port, caCerts, cert, key });
    return await Deno.connectTls({ hostname, port, caCerts, cert, key });
  }

  protected override createConn(
    protocol: string,
    hostname: string,
    port?: number,
    caCerts?: string[],
    cert?: string,
    key?: string,
  ): Promise<SockConn> {
    // if you need to support alternative connection types just
    // overload this method in your subclass
    if (protocol === "mqtts:") {
      return this.connectMQTTS(hostname, port, caCerts, cert, key);
    }
    if (protocol === "mqtt:") {
      return this.connectMQTT(hostname, port);
    }
    throw `Unsupported protocol: ${protocol}`;
  }
}
