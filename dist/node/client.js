// this a NodeJS specific implementation of TCP client sockets
// it extends the platform agnostic Client class
import { Client } from "../client/client.js";
import { logger } from "../client/deps.js";
import { readFile } from "node:fs/promises";
import { createConnection } from "node:net";
import * as tls from "node:tls";
import { wrapNodeSocket } from "./wrapNodeSocket.js";
export async function getCaCerts(filename) {
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
    connectMQTT(hostname, port = 1883) {
        logger.debug({ hostname, port });
        return new Promise((resolve, reject) => {
            const socket = createConnection({ port, host: hostname }, () => {
                logger.debug("Connected to server");
                resolve(wrapNodeSocket(socket));
            });
            socket.once("error", (err) => {
                logger.debug("Connection failed: ", err);
                reject(err);
            });
        });
    }
    connectMQTTS(hostname, port = 8883, caCerts) {
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
    createConn(protocol, hostname, port, caCerts) {
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
