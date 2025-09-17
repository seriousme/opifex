#!/usr/bin/env -S node --experimental-strip-types

/**
 * @fileoverview MQTT command line interface that provides publish and subscribe functionality
 * @module mqtt-cli
 *
 * @description
 * This module implements a command line interface for MQTT operations:
 * - Publish messages to an MQTT broker
 * - Subscribe to topics on an MQTT broker
 *
 * Features:
 * - TLS support with custom certificates
 * - Authentication with username/password
 * - Configurable QoS levels (0-2)
 * - Message retention
 * - Session persistence
 * - Custom client IDs
 *
 * @example
 * # Publish a message
 * mqtt publish -t topic -m message
 *
 * # Subscribe to a topic
 * mqtt subscribe -t topic
 *
 * @requires node:util
 * @requires ../client/mod.ts
 * @requires ../node/tcpClient.ts
 * @requires ../utils/mod.ts
 */

import { parseArgs } from "node:util";
import type { ParseArgsConfig } from "node:util";
import {
  DEFAULT_KEEPALIVE,
  DEFAULT_PROTOCOLLEVEL,
  DEFAULT_URL,
} from "../client/mod.ts";
import type { ProtocolLevel } from "../client/mod.ts";
import { getFileData, TcpClient } from "../node/tcpClient.ts";
import { logger, LogLevel } from "../utils/mod.ts";

type Args = Record<string, string | boolean>;
const client = new TcpClient();
const encoder = new TextEncoder();
const decoder = new TextDecoder();
logger.level(LogLevel.info);

const MQTTHelp = `MQTT command line interface, available commands are:

    * publish     publish a message to the broker
    * subscribe   subscribe for updates from the broker

Run 'mqtt [command] --help' to know more about the commands.`;

const ConnectHelp = `
  -u/--url        the URL to connect to: default is ${DEFAULT_URL}
  -i/--clientId   the clientId to connect to the server
  -U/--username   the username to connect to the server
  -P/--password   the password to connect to the server
  -C/--caFile     the path to a CA certificate file
  -V/--mqttVersion the MQTT version to use (3,4 or 5): default is ${DEFAULT_PROTOCOLLEVEL}
  -c/--certFile   the path to a certificate file
  -k/--keyFile    the path to a key file
  -K/--keepAlive  the keep alive of the client (in seconds): default is ${DEFAULT_KEEPALIVE}
  -n/--noClean    try to resume a previous session
  -h/--help       this text
  `;

const connectOpts = {
  url: { type: "string", short: "u", default: DEFAULT_URL },
  username: { type: "string", short: "U" },
  password: { type: "string", short: "P" },
  caFile: { type: "string", short: "C" },
  certFile: { type: "string", short: "c" },
  keyFile: { type: "string", short: "k" },
  keepAlive: {
    type: "string",
    short: "K",
    default: DEFAULT_KEEPALIVE.toString(),
  },
  clientId: {
    type: "string",
    short: "i",
    default: `Opifex-${crypto.randomUUID()}`,
  },
  noClean: { type: "boolean", short: "n", default: false },
  mqttVersion: {
    type: "string",
    short: "V",
    default: DEFAULT_PROTOCOLLEVEL?.toString(),
  },
  help: { type: "boolean", short: "h", default: false },
} as const;

async function connect(connectArgs: Args) {
  const {
    caCerts,
    cert,
    key,
  } = await getTLSdata(connectArgs);
  await client.connect({
    url: new URL(connectArgs.url as string),
    caCerts,
    cert,
    key,
    options: {
      username: connectArgs.username as string,
      password: encodePwd(connectArgs.password as string),
      clientId: connectArgs.clientId as string,
      clean: !connectArgs.noClean,
      keepAlive: Number(connectArgs.keepAlive),
      protocolLevel: parseInt(
        connectArgs.mqttVersion as string,
      ) as ProtocolLevel,
    },
  });
  logger.debug("Connected !");
}

function parseQos(qosArg: string | number) {
  const qos = Number(qosArg);
  switch (qos) {
    case 0:
      return 0;
    case 1:
      return 1;
    case 2:
      return 2;
    default:
      break;
  }
  console.log("QoS must be between 0 and 2");
  return 0;
}

function safeParseArgs(config: ParseArgsConfig) {
  try {
    return parseArgs(config);
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error(err.message);
    }
  }
}

async function getTLSdata(connectArgs: Args) {
  const caFileData = await getFileData(connectArgs.caFile as string);
  const caCerts = caFileData ? [caFileData] : undefined;
  const cert = await getFileData(connectArgs.certFile as string);
  const key = await getFileData(connectArgs.keyFile as string);
  return {
    caCerts,
    cert,
    key,
  };
}

function encodePwd(password: string | undefined) {
  if (typeof password === "string") {
    return encoder.encode(password);
  }
  return undefined;
}

const SubscribeHelp = `Usage: mqtt subscribe <options>

Where options are:
  -t/--topic      the topic to use
  -q/--qos        the QoS (0/1/2) to use, default is 0
${ConnectHelp}
Example: mqtt subscribe -t hello`;

const subscribeOpts = {
  topic: { type: "string", short: "t" },
  qos: { type: "string", short: "q", default: "0" },
} as const;

async function subscribe() {
  const res = safeParseArgs({
    options: { ...connectOpts, ...subscribeOpts },
    allowPositionals: true,
  });
  if (!res) return;
  const subscribeArgs = res.values as Record<string, string | boolean>;
  if (subscribeArgs.help) {
    console.log(SubscribeHelp);
    return;
  }
  if (typeof subscribeArgs.topic !== "string") {
    console.log("Missing `topic`");
    return;
  }
  try {
    await connect(subscribeArgs);
    client.subscribe({
      subscriptions: [
        {
          topicFilter: subscribeArgs.topic,
          qos: parseQos(subscribeArgs.qos as string),
        },
      ],
    });
    logger.debug("Subscribed!");

    for await (const message of client.messages()) {
      console.log(decoder.decode(message.payload));
    }
  } catch (err) {
    if (err instanceof Error) {
      // @ts-ignore the type spec of err is missing err.code
      logger.info(`Error: ${err.message || err.code}`);
    }
  }
}

const PublishHelp = `Usage: mqtt publish <options>

Where options are:
  -t/--topic      the topic to use
  -m/--message    the message to send
  -q/--qos        the QoS (0/1/2) to use, default is 0
  -r/--retain     if the message should be retained, default is false
${ConnectHelp}
Example: mqtt publish -t hello -m world`;

const publishOpts = {
  topic: { type: "string", short: "t" },
  message: { type: "string", short: "m" },
  qos: { type: "string", short: "q", default: "0" },
  retain: { type: "boolean", short: "r", default: false },
} as const;

async function publish() {
  const res = safeParseArgs({
    options: { ...connectOpts, ...publishOpts },
    allowPositionals: true,
  });
  if (!res) return;
  const publishArgs = res.values as Record<string, string | boolean>;
  if (publishArgs.help) {
    console.log(PublishHelp);
    return;
  }
  if (typeof publishArgs.topic !== "string") {
    console.log("Missing `topic`");
    return;
  }
  try {
    await connect(publishArgs);
    await client.publish({
      topic: publishArgs.topic,
      payload: encoder.encode(publishArgs.message as string),
      retain: publishArgs.retain as boolean,
      qos: parseQos(publishArgs.qos as string),
    });
    logger.debug("Published!");
    client.disconnect();
    logger.debug("Disconnected !");
  } catch (err) {
    if (err instanceof Error) {
      // @ts-ignore the type spec of err is missing err.code
      logger.info(`Error: ${err.message || err.code}`);
    }
  }
}

function processArgs() {
  const res = safeParseArgs({
    strict: false,
    allowPositionals: true,
  });
  const positionals = res !== undefined ? res.positionals : [];
  const cmd = positionals[0];
  switch (cmd) {
    case "publish":
      publish();
      break;
    case "subscribe":
      subscribe();
      break;
    default:
      console.log(MQTTHelp);
      break;
  }
}

processArgs();
