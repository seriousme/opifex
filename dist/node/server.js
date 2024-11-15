import { createServer } from "node:net";
import { MqttServer } from "../server/mod.js";
import { wrapNodeSocket } from "./wrapNodeSocket.js";
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
        return this.serverOptions.port;
    }
}
