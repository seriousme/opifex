/*
 * this a NodeJS specific implementation of TCP client sockets
 * it extends the platform agnostic Client class
 *  @module
 */
import { Client } from "../client/client.ts";
import { logger } from "../client/deps.ts";
import { readFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { connect } from "node:tls";
import type { ConnNext } from "../client/mod.ts";
import { nodeSocketToNext } from "./nodeSocketToNext.ts";

/**
 * Fetches data from a file and returns it as a string
 *
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
  const data = await readFile(filename, { encoding: "utf-8" });
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
  protected override connectMQTT(
    hostname: string,
    port = 1883,
  ): Promise<ConnNext> {
    logger.debug({ hostname, port });
    return new Promise((resolve, reject) => {
      const socket = createConnection(
        { port, host: hostname },
        () => {
          logger.debug("Connected to server");
          resolve(nodeSocketToNext(socket));
        },
      );
      socket.once("error", (err) => {
        logger.debug("Connection failed: ", err);
        reject(err);
      });
    });
  }

  /**
   * Connect using MQTT over TLS
   * @param hostname the name of the host to connect to
   * @param port the port number
   * @param caCerts the CA certificates to trust
   * @param cert the clients certificate
   * @param key the clients private key
   * @returns a SockConn object
   */
  protected override connectMQTTS(
    hostname: string,
    port = 8883,
    ca?: string[],
    cert?: string,
    key?: string,
  ): Promise<ConnNext> {
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
      const socket = connect(opts, () => {
        logger.debug("Connected to server");
        resolve(nodeSocketToNext(socket));
      });
      socket.once("error", (err) => {
        logger.debug("Connection failed", err);
        reject(err);
      });
    });
  }
}
