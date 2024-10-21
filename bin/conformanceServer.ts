// this server is intended to be used with https://github.com/eclipse/iottestware

import {
  AuthenticationResult,
} from "../server/mod.ts";
import type {
  TAuthenticationResult,
  Context,
  Topic,
} from "../server/mod.ts";
import { logger, LogLevel } from "../utils/mod.ts";
import { getArgs, parseArgs } from "../utils/mod.ts";
import { TcpServer } from "../deno/server.ts";

const utf8Decoder = new TextDecoder();
const userTable = new Map();
userTable.set("IoTester_1", "strong_password");
userTable.set("IoTester_2", "strong_password");
const strictUsername = new RegExp(/^[a-zA-Z0-9]{0,23}$/);
const notAuthorizedTable = new Set();
notAuthorizedTable.add(["123-456-789", "eclipse/iot/tesware/0data"]);

function isAuthenticated(
  _ctx: Context,
  clientId: string,
  username: string,
  password: Uint8Array,
): TAuthenticationResult {
  const pwd = utf8Decoder.decode(password);
  logger.debug(
    `Verifying authentication of client '${clientId}' with username '${username}' and password '${pwd}'`,
  );

  if (!userTable.has(username)) {
    if (!strictUsername.test(username)) {
      return AuthenticationResult.badUsernameOrPassword;
    }
  }
  const pass = userTable.get(username);
  if (pwd === pass) {
    return AuthenticationResult.ok;
  }
  return AuthenticationResult.notAuthorized;
}

function isAuthorizedToPublish(ctx: Context, topic: Topic): boolean {
  logger.debug(
    `Checking authorization of client '${ctx.store?.clientId}' to publish on topic '${topic}'`,
  );
  // if (notAuthorizedTable.has([ctx.client,topic])){
  //   return false;
  // }
  return true;
}
function isAuthorizedToSubscribe(ctx: Context, topic: Topic): boolean {
  logger.debug(
    `Checking authorization of client '${ctx.store?.clientId}' to subscribe to topic '${topic}'`,
  );
  return true;
}

/** start the server **/
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
