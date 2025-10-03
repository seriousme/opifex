/*
 * this a NodeJS specific implementation of TCP client sockets
 * it extends the platform agnostic Client class
 *  @module
 */
import { Client } from "../client/client.ts";
import { logger } from "../client/deps.ts";
import { readFile } from "node:fs/promises";
import { createConnection } from "node:net";
import * as tls from "node:tls";
import type { SockConn } from "../socket/socket.ts";
import { wrapNodeSocket } from "./wrapNodeSocket.ts";

/**
 * @function getFileData
 * @param filename
 * @returns Promise
 *
 * Fetches data from a file and returns it as a string
 * @example
 * const data = await getFileData("data.txt");
 */
export async function getFileData(filename: string | undefined) {
  if (!filename) {
    return;
  }
  const data = await readFile(filename, { encoding: "utf-8" });
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
  protected connectMQTT(hostname: string, port = 1883): Promise<SockConn> {
    logger.debug({ hostname, port });
    return new Promise((resolve, reject) => {
      const socket = createConnection(
        { port, host: hostname },
        () => {
          logger.debug("Connected to server");
          resolve(wrapNodeSocket(socket));
        },
      );
      socket.once("error", (err) => {
        logger.debug("Connection failed: ", err);
        reject(err);
      });
    });
  }

  protected connectMQTTS(
    hostname: string,
    port = 8883,
    ca?: string[],
    cert?: string,
    key?: string,
  ): Promise<SockConn> {
    const opts = {
      host: hostname,
      port,
      secureContext: (ca || key || cert)
        ? tls.createSecureContext({ ca, cert, key })
        : undefined,
    };
    logger.debug({ hostname, port, ca, cert });
    return new Promise((resolve, reject) => {
      const socket = tls.connect(opts, () => {
        logger.debug("Connected to server");
        resolve(wrapNodeSocket(socket));
      });
      socket.once("error", (err) => {
        logger.debug("Connection failed", err);
        reject(err);
      });
    });
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
    throw new Error(`Unsupported protocol: ${protocol}`);
  }
}
