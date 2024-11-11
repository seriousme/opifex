// This a Deno specific implementation of TCP client sockets
// it extends the platform agnostic Client class
import { Client } from "../client/client.ts";
import { logger } from "../client/deps.ts";
import { wrapDenoConn } from "./wrapDenoConn.ts";
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
    return wrapDenoConn(await Deno.connect({ hostname, port }));
  }

  protected async connectMQTTS(
    hostname: string,
    port = 8883,
    caCerts?: string[],
  ) {
    logger.debug({ hostname, port, caCerts });
    return wrapDenoConn(await Deno.connectTls({ hostname, port, caCerts }));
  }

  protected override createConn(
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
