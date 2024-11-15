// this a NodeJS specific implementation of TCP client sockets
// it extends the platform agnostic Client class
import { Client } from "../client/client.js";
import { logger } from "../client/deps.js";
import { readFile } from "node:fs/promises";
import { connect } from "node:net";
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
    async connectMQTT(hostname, port = 1883) {
        logger.debug({ hostname, port });
        return wrapNodeSocket(await connect({ host: hostname, port }));
    }
    async connectMQTTS(hostname, port = 8883, caCerts) {
        const opts = {
            host: hostname,
            port,
            secureContext: caCerts
                ? tls.createSecureContext({ cert: caCerts })
                : undefined,
        };
        logger.debug({ hostname, port, caCerts });
        return wrapNodeSocket(await tls.connect(opts));
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
