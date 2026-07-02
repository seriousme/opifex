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
      ca,
      key,
      cert,
      minVersion: "TLSv1.3" as const,
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

  // overload createConn from the base client class
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
