/**
 * This a Deno specific implementation of TCP client sockets
 * it extends the platform agnostic Client class
 * @module
 */

import { Client, logger } from "../client/mod.ts";
import type { SockConn } from "../client/mod.ts";

/** Type exports to aid consumers */
export type {
  AuthenticationResult,
  Client,
  ConnectionState,
  ConnectParameters,
  NetAddr,
  PublishParameters,
  SockAddr,
  SockConn,
  SubscribeParameters,
  UnixAddr,
  VsockAddr,
} from "../client/mod.ts";

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
 * TCPclient extends the Client class to provide TCP based clients
 * it is used by the MQTTclient to connect to the broker
 * see mqtt.ts in the /bin folder as an example
 */
export class TcpClient extends Client {
  /** Connect using MQTT over TCP
   * @param hostname the name of the host to connect to
   * @param port the port number
   */
  protected async connectMQTT(
    hostname: string,
    port = 1883,
  ): Promise<Deno.TcpConn> {
    logger.debug({ hostname, port });
    return await Deno.connect({ hostname, port });
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
  protected async connectMQTTS(
    hostname: string,
    port = 8883,
    caCerts?: string[],
    cert?: string,
    key?: string,
  ): Promise<Deno.TlsConn> {
    logger.debug({ hostname, port, caCerts, cert });
    const connectOpts = {
      hostname,
      port,
      ...(caCerts !== undefined && { caCerts }),
      ...(cert !== undefined && { cert }),
      ...(key !== undefined && { key }),
    };
    return await Deno.connectTls(connectOpts);
  }

  /** createConn is used by the base client class */
  protected override createConn(): Promise<SockConn> {
    const { protocol, hostname, port: portStr } = this.connectUrl;
    const port = Number(portStr);
    const caCerts = this.caCerts;
    const cert = this.cert;
    const key = this.key;

    if (protocol === "mqtts:") {
      return this.connectMQTTS(hostname, port, caCerts, cert, key);
    }
    if (protocol === "mqtt:") {
      return this.connectMQTT(hostname, port);
    }
    throw new Error(`Unsupported protocol: ${protocol}`);
  }
}
