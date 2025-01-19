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
    async start() {
        this.server = createServer((sock) => this.mqttServer.serve(wrapNodeSocket(sock)));
        const isListening = new Promise((resolve) => {
            this.server?.on("listening", () => {
                resolve(true);
            });
        });
        this.server.listen(this.serverOptions.port, this.serverOptions.hostname);
        await isListening;
        return;
    }
    stop() {
        this.server?.close();
    }
    get port() {
        const address = this.server?.address();
        if (typeof address === "object" && address !== null) {
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
