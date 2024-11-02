#!/usr/bin/env node
import { C as Client, D as DEFAULT_URL } from "../client-DqLTBVC2.js";
import { L as LogLevel, l as logger } from "../timer-DDWVNsyG.js";
import {
  g as getArgs,
  p as parseArgs,
  w as wrapNodeSocket,
} from "../wrapNodeSocket-BAJm059T.js";
import "node:process";
import { readFile } from "node:fs/promises";
import { connect } from "node:net";
import * as tls from "node:tls";
import "node:stream";

async function getCaCerts(filename) {
  if (!filename) {
    return;
  }
  const caCerts = await readFile(filename, { encoding: "utf-8" });
  if (caCerts === "") {
    return;
  }
  return [caCerts];
}
class TcpClient extends Client {
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
        : void 0,
    };
    logger.debug({ hostname, port, caCerts });
    return wrapNodeSocket(await tls.connect(opts));
  }
  createConn(protocol, hostname, port, caCerts) {
    if (protocol === "mqtts:") {
      return this.connectMQTTS(hostname, port, caCerts);
    }
    if (protocol === "mqtt:") {
      return this.connectMQTT(hostname, port);
    }
    throw `Unsupported protocol: ${protocol}`;
  }
}

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
  -c/--certFile   the path to a certFile
  -n/--noClean    try to resume a previous session
  -h/--help       this text
  `;
const connectOpts = {
  string: ["url", "username", "password", "certFile", "clientId"],
  alias: {
    u: "url",
    U: "username",
    P: "password",
    c: "certFile",
    i: "clientId",
    n: "noClean",
    h: "help",
  },
  boolean: ["noClean", "help"],
  default: {
    noClean: false,
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
function parseQos(qosArg) {
  const qos = Number(qosArg);
  switch (qos) {
    case 0:
      return 0;
    case 1:
      return 1;
    case 2:
      return 2;
  }
  console.log("QoS must be between 0 and 2");
  return 0;
}
async function subscribe() {
  const connectArgs = parseArgs(getArgs(), connectOpts);
  const caCerts = await getCaCerts(connectArgs.certFile);
  const subscribeArgs = parseArgs(getArgs(), subscribeOpts);
  if (connectArgs.help) {
    console.log(SubscribeHelp);
    return;
  }
  if (subscribeArgs.topic === void 0) {
    console.log("Missing `topic`");
    return;
  }
  try {
    await client.connect({
      url: connectArgs.url,
      caCerts,
      options: {
        username: connectArgs.username,
        password: encoder.encode(connectArgs.password),
        clientId: connectArgs.clientId,
        clean: !connectArgs.noClean,
        keepAlive: 60,
      },
    });
    logger.debug("Connected !");
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
      logger.info(err.message);
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
    topic: void 0,
    message: "",
  },
};
async function publish() {
  const connectArgs = parseArgs(getArgs(), connectOpts);
  const caCerts = await getCaCerts(connectArgs.certFile);
  const publishArgs = parseArgs(getArgs(), publishOpts);
  if (connectArgs.help) {
    console.log(PublishHelp);
    return;
  }
  if (publishArgs.topic === void 0) {
    console.log("Missing `topic`");
    return;
  }
  try {
    await client.connect({
      url: connectArgs.url,
      caCerts,
      options: {
        username: connectArgs.username,
        password: encoder.encode(connectArgs.password),
        clientId: connectArgs.clientId,
        clean: !connectArgs.noClean,
      },
    });
    logger.debug("Connected !");
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
      logger.info(err.message);
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
