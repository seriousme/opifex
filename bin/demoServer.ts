#!/usr/bin/env -S node --experimental-strip-types

/**
 * MQTT Server implementation with authentication and authorization
 * @module mqttServer
 */
import { parseArgs } from "node:util";
import { TcpServer } from "../node/tcpServer.ts";
import type { Context, TAuthenticationResult, Topic } from "../server/mod.ts";
import { AuthenticationResult } from "../server/mod.ts";
import { logger, LogLevel } from "../utils/mod.ts";

/**
 * UTF-8 decoder for parsing passwords
 */
const utf8Decoder = new TextDecoder();

/**
 * Map storing valid username/password combinations
 */
const userTable = new Map();
userTable.set("IoTester_1", "strong_password");
userTable.set("IoTester_2", "strong_password");

/**
 * Regular expression for validating usernames
 * Allows alphanumeric characters up to 23 chars long
 */
const strictUsername = new RegExp(/^[a-zA-Z0-9]{0,23}$/);

/**
 * Flag to enable/disable username checking
 * If false, all users are allowed access
 * If true, only users in userTable are allowed access
 */
const checkUsername = false;

/**
 * Authenticates MQTT clients
 * @param {Context} _ctx - Connection context
 * @param {string} clientId - Client identifier
 * @param {string} username - Username to authenticate
 * @param {Uint8Array} password - Password as byte array
 * @returns {TAuthenticationResult} Authentication result
 */
function isAuthenticated(
  _ctx: Context,
  clientId: string,
  username: string,
  password: Uint8Array,
): TAuthenticationResult {
  const pwd = utf8Decoder.decode(password);
  logger.info(
    `Verifying authentication of client '${clientId}' with username '${username}' and password '${pwd}'`,
  );

  if (!checkUsername) {
    // allow all users access
    return AuthenticationResult.ok;
  }
  // is the username valid according to MQTT specification
  if (!strictUsername.test(username)) {
    return AuthenticationResult.badUsernameOrPassword;
  }
  // Does user and password match an entry in userTable
  if (userTable.has(username)) {
    const pass = userTable.get(username);
    if (pwd === pass) {
      return AuthenticationResult.ok;
    }
  }
  return AuthenticationResult.notAuthorized;
}

/**
 * Checks if client is authorized to publish to a topic
 * @param {Context} ctx - Connection context
 * @param {Topic} topic - Topic to publish to
 * @returns {boolean} True if authorized
 */
function isAuthorizedToPublish(ctx: Context, topic: Topic): boolean {
  logger.debug(
    `Checking authorization of client '${ctx.store?.clientId}' to publish on topic '${topic}'`,
  );
  return true;
}

/**
 * Checks if client is authorized to subscribe to a topic
 * @param {Context} ctx - Connection context
 * @param {Topic} topic - Topic to subscribe to
 * @returns {boolean} True if authorized
 */
function isAuthorizedToSubscribe(ctx: Context, topic: Topic): boolean {
  logger.debug(
    `Checking authorization of client '${ctx.store?.clientId}' to subscribe to topic '${topic}'`,
  );
  return true;
}

/**
 * Parse command line arguments and start server
 */
const { positionals: [portNum] } = parseArgs({ allowPositionals: true });
const port = Number(portNum ?? 1883);
const hostname = "::";
logger.level(LogLevel.info);

/**
 * TCP Server instance with authentication and authorization handlers
 */
const tcpServer = new TcpServer({ port, hostname }, {
  handlers: {
    isAuthenticated,
    isAuthorizedToPublish,
    isAuthorizedToSubscribe,
  },
});
tcpServer.start();
logger.info(`Server started on port ${tcpServer.port}`);
