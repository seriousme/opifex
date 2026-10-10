/**
 * This a Deno specific implementation of TCP client sockets
 * it extends the platform agnostic Client class
 * @module
 */

import { Client, logger } from "../client/mod.ts";
import type { ConnNext } from "../client/mod.ts";
import { denoConnToNext } from "./denoConnToNext.ts";

/**
 * Fetches data from a file and returns it as a string
 *
 * @param filename
 * @returns Promise
 *
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

/**
 * TcpClient extends the Client class to provide TCP based clients
 * it is used by the MQTTclient to connect to the broker
 * see mqtt.ts in the /bin folder as an example
 */
export class TcpClient extends Client {
  /** Connect using MQTT over TCP
   * @param hostname the name of the host to connect to
   * @param port the port number
   */
  protected override async connectMQTT(
    hostname: string,
    port = 1883,
  ): Promise<ConnNext> {
    logger.debug({ hostname, port });
    return denoConnToNext(await Deno.connect({ hostname, port }));
  }

  /**
   * Connect using MQTT over TLS
   * @param hostname the name of the host to connect to
   * @param port the port number
   * @param caCerts the CA certificates to trust
   * @param cert the clients certificate
   * @param key the clients private key
   * @returns a Deno.TlsConn object
   */
  protected override async connectMQTTS(
    hostname: string,
    port = 8883,
    caCerts?: string[],
    cert?: string,
    key?: string,
  ): Promise<ConnNext> {
    logger.debug({ hostname, port, caCerts, cert });
    const connectOpts = {
      hostname,
      port,
      ...(caCerts !== undefined && { caCerts }),
      ...(cert !== undefined && { cert }),
      ...(key !== undefined && { key }),
    };
    return denoConnToNext(await Deno.connectTls(connectOpts));
  }
}
