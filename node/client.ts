// this a NodeJS specific implementation of TCP client sockets
// it extends the platform agnostic Client class
import { Client } from "../client/client.ts";
import { logger } from "../client/deps.ts";
import { readFile } from "node:fs/promises";
import { createConnection } from "node:net";
import * as tls from "node:tls";
import type { SockConn } from "../socket/socket.ts";
import { wrapNodeSocket } from "./wrapNodeSocket.ts";

export async function getCaCerts(filename: string | undefined) {
  if (!filename) {
    return;
  }
  const caCerts = await readFile(filename, { encoding: "utf-8" });
  if (caCerts === "") {
    return;
  }
  return [caCerts];
}

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
    caCerts?: string[],
  ): Promise<SockConn> {
    const opts = {
      host: hostname,
      port,
      secureContext: caCerts
        ? tls.createSecureContext({ cert: caCerts })
        : undefined,
    };
    logger.debug({ hostname, port, caCerts });
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
    throw `Unsupported protocol: ${protocol}`;
  }
}
