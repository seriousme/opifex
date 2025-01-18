import { createServer } from "node:net";
import { MqttServer } from "../server/mod.js";
import { wrapNodeSocket } from "./wrapNodeSocket.js";
/*
 * TCP server that wraps a MqttServer, see demoServer.ts in the /bin folder
 */
export class TcpServer {
    mqttServer;
    server;
    serverOptions;
    constructor(serverOptions, mqttOptions) {
        this.mqttServer = new MqttServer(mqttOptions);
        this.serverOptions = serverOptions;
    }
    start() {
        this.server = createServer((sock) => this.mqttServer.serve(wrapNodeSocket(sock)));
        this.server.listen(this.serverOptions.port, this.serverOptions.hostname);
    }
    stop() {
        this.server?.close();
    }
    get port() {
        const address = this.server?.address();
        if (typeof address === "object") {
            return address?.port;
        }
        return this.serverOptions?.port;
    }
    get address() {
        const addressResult = this.server?.address();
        if (typeof addressResult === "object") {
            const address = addressResult?.address;
            if (address === "::") {
                return "localhost";
            }
            if (address?.includes(":")) {
                return `[${address}]`;
            }
            return address;
        }
        return addressResult;
    }
}
