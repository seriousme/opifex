/**
 * This a Deno specific implementation of TCP client sockets
 * it extends the platform agnostic Client class
 * @module
 */
import { Client } from "../client/client.ts";
import { logger } from "../client/deps.ts";
import type { SockConn } from "../client/deps.ts";

/**
 * @function getFileData
 * @param filename
 * @returns Promise
 *
 * Fetches data from a file and returns it as a string
 * @example
 * const data = await getFileData("data.txt");
 */
export async function getFileData(
  filename: string | undefined,
): Promise<string | undefined> {
  if (!filename) {
    return;
  }
  const data = await Deno.readTextFile(filename);
  if (data === "") {
    return;
  }
  return data;
}

/*
 * TCPclient extends the Client class to provide TCP based clients
 * it is used by the MQTTclient to connect to the broker
 * see mqtt.ts in the /bin folder as an example
 */
export class TcpClient extends Client {
  protected async connectMQTT(
    hostname: string,
    port = 1883,
  ): Promise<Deno.TcpConn> {
    logger.debug({ hostname, port });
    return await Deno.connect({ hostname, port });
  }

  protected async connectMQTTS(
    hostname: string,
    port = 8883,
    caCerts?: string[],
    cert?: string,
    key?: string,
  ): Promise<Deno.TlsConn> {
    logger.debug({ hostname, port, caCerts, cert });
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
    throw new Error(`Unsupported protocol: ${protocol}`);
  }
}
