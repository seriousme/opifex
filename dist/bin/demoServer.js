#!/usr/bin/env node
import { createServer } from "node:net";
import {
  A as AuthenticationResult,
  L as LogLevel,
  l as logger,
} from "../timer-DDWVNsyG.js";
import "node:process";
import { MqttServer } from "../server/mod.js";
import {
  g as getArgs,
  p as parseArgs,
  w as wrapNodeSocket,
} from "../wrapNodeSocket-BAJm059T.js";
import "node:stream";

class TcpServer {
  mqttServer;
  server;
  serverOptions;
  constructor(serverOptions, mqttOptions) {
    this.mqttServer = new MqttServer(mqttOptions);
    this.serverOptions = serverOptions;
  }
  start() {
    this.server = createServer(
      (sock) => this.mqttServer.serve(wrapNodeSocket(sock)),
    );
    this.server.listen(this.serverOptions.port, this.serverOptions.hostname);
  }
  stop() {
    this.server?.close();
  }
  get port() {
    return this.serverOptions.port;
  }
}

const utf8Decoder = new TextDecoder();
const userTable = /* @__PURE__ */ new Map();
userTable.set("IoTester_1", "strong_password");
userTable.set("IoTester_2", "strong_password");
function isAuthenticated(_ctx, clientId, username, password) {
  const pwd = utf8Decoder.decode(password);
  logger.info(
    `Verifying authentication of client '${clientId}' with username '${username}' and password '${pwd}'`,
  );
  return AuthenticationResult.ok;
}
function isAuthorizedToPublish(ctx, topic) {
  logger.debug(
    `Checking authorization of client '${ctx.store?.clientId}' to publish on topic '${topic}'`,
  );
  return true;
}
function isAuthorizedToSubscribe(ctx, topic) {
  logger.debug(
    `Checking authorization of client '${ctx.store?.clientId}' to subscribe to topic '${topic}'`,
  );
  return true;
}
const { _: [portNum] } = parseArgs(getArgs());
const port = Number(portNum ?? 1883);
const hostname = "::";
logger.level(LogLevel.info);
const tcpServer = new TcpServer({ port, hostname }, {
  handlers: {
    isAuthenticated,
    isAuthorizedToPublish,
    isAuthorizedToSubscribe,
  },
});
tcpServer.start();
logger.info(`Server started on port ${tcpServer.port}`);
