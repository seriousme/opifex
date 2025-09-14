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
 * @requires node
 * @requires ../client/mod.ts
 * @requires ../node/tcpClient.ts
 * @requires ../utils/mod.ts
 */

import {
  DEFAULT_KEEPALIVE,
  DEFAULT_PROTOCOLLEVEL,
  DEFAULT_URL,
} from "../client/mod.ts";
import type { ProtocolLevel } from "../client/mod.ts";
import { getFileData, TcpClient } from "../node/tcpClient.ts";
import { getArgs, logger, LogLevel, parseArgs } from "../utils/mod.ts";
import type { Args } from "../utils/mod.ts";

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
  string: [
    "url",
    "username",
    "password",
    "caFile",
    "certFile",
    "keyFile",
    "clientId",
    "mqttVersion",
  ],
  alias: {
    u: "url",
    U: "username",
    P: "password",
    C: "caFile",
    c: "certFile",
    k: "keyFile",
    K: "keepAlive",
    i: "clientId",
    n: "noClean",
    V: "mqttVersion",
    h: "help",
  },
  boolean: ["noClean", "help"],
  default: {
    noClean: false,
    clientId: `Opifex-${crypto.randomUUID()}`,
    keepAlive: DEFAULT_KEEPALIVE,
    mqttVersion: DEFAULT_PROTOCOLLEVEL,
  },
};

const SubscribeHelp = `Usage: mqtt subscribe <options>

Where options are:
  -t/--topic      the topic to use
  -q/--qos        the QoS (0/1/2) to use, default is 0
${ConnectHelp}
Example: mqtt subscribe -t hello`;

const subscribeOpts = {
  string: ["topic"],
  alias: {
    t: "topic",
    q: "qos",
  },
  default: {
    qos: 0,
    topic: "",
  },
};

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

async function getTLSdata(connectArgs: Args) {
  const caFileData = await getFileData(connectArgs.caFile);
  const caCerts = caFileData ? [caFileData] : undefined;
  const cert = await getFileData(connectArgs.certFile);
  const key = await getFileData(connectArgs.keyFile);
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

async function subscribe() {
  const connectArgs = parseArgs(getArgs(), connectOpts);
  const subscribeArgs = parseArgs(getArgs(), subscribeOpts);
  if (connectArgs.help) {
    console.log(SubscribeHelp);
    return;
  }
  if (subscribeArgs.topic === undefined) {
    console.log("Missing `topic`");
    return;
  }
  try {
    await connect(connectArgs);
    client.subscribe({
      subscriptions: [
        {
          topicFilter: subscribeArgs.topic,
          qos: parseQos(subscribeArgs.qos),
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
  string: ["topic", "message"],
  boolean: ["retain"],
  alias: {
    t: "topic",
    m: "message",
    q: "qos",
    r: "retain",
  },
  default: {
    qos: 0,
    dup: false,
    retain: false,
    topic: undefined,
    message: "",
  },
};

async function connect(connectArgs: Args) {
  const {
    caCerts,
    cert,
    key,
  } = await getTLSdata(connectArgs);
  await client.connect({
    url: connectArgs.url,
    caCerts,
    cert,
    key,
    options: {
      username: connectArgs.username,
      password: encodePwd(connectArgs.password),
      clientId: connectArgs.clientId,
      clean: !connectArgs.noClean,
      keepAlive: connectArgs.keepAlive,
      protocolLevel: parseInt(connectArgs.mqttVersion) as ProtocolLevel,
    },
  });
  logger.debug("Connected !");
}

async function publish() {
  const connectArgs = parseArgs(getArgs(), connectOpts);
  const publishArgs = parseArgs(getArgs(), publishOpts);
  if (connectArgs.help) {
    console.log(PublishHelp);
    return;
  }
  if (publishArgs.topic === undefined) {
    console.log("Missing `topic`");
    return;
  }
  try {
    await connect(connectArgs);
    await client.publish({
      topic: publishArgs.topic,
      payload: encoder.encode(publishArgs.message),
      retain: publishArgs.retain,
      qos: parseQos(publishArgs.qos),
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
  const { _: [cmd] } = parseArgs(getArgs());
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
