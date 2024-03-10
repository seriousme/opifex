import { DenoClient as Client, parseArgs } from "../deno/client.ts";
import { DEFAULT_URL } from "../client/mod.ts";
import { logger } from "../utils/mod.ts";

const client = new Client();
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const MQTTHelp = `MQTT.ts command line interface, available commands are:

    * publish     publish a message to the broker
    * subscribe   subscribe for updates from the broker

Launch 'mqtt.ts [command] --help' to know more about the commands.`;

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

const SubscribeHelp = `Usage: MQTT.ts subscribe <options>

Where options are:
  -t/--topic      the topic to use
  -q/--qos        the QoS (0/1/2) to use, default is 0
${ConnectHelp}
Example: MQTT.ts subscribe -t hello`;

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

async function getCaCerts(filename: string | undefined) {
  if (!filename) {
    return;
  }
  const caCerts = await Deno.readTextFile(filename);
  if (caCerts === "") {
    return;
  }
  return [caCerts];
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

async function subscribe(args: string[]) {
  const connectArgs = parseArgs(Deno.args, connectOpts);
  const caCerts = await getCaCerts(connectArgs.certFile);
  const subscribeArgs = parseArgs(args, subscribeOpts);
  if (connectArgs.help) {
    console.log(SubscribeHelp);
    return;
  }
  if (subscribeArgs.topic === undefined) {
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
    logger.debug(err.message);
  }
}

const PublishHelp = `Usage: MQTT.ts publish <options>

Where options are:
  -t/--topic      the topic to use
  -m/--message    the message to send
  -q/--qos        the QoS (0/1/2) to use, default is 0
  -r/--retain     if the message should be retained, default is false
${ConnectHelp}
Example: MQTT.ts publish -t hello -m world`;

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
    topic: "",
    message: "",
  },
};

async function publish(args: string[]) {
  const connectArgs = parseArgs(Deno.args, connectOpts);
  const caCerts = await getCaCerts(connectArgs.certFile);
  const publishArgs = parseArgs(args, publishOpts);
  if (connectArgs.help) {
    console.log(PublishHelp);
    return;
  }
  if (publishArgs.topic === undefined) {
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
    logger.debug(err.message);
  }
}

function processArgs(args: string[]) {
  const cmd = args[0];
  switch (cmd) {
    case "publish":
      publish(args);
      break;
    case "subscribe":
      subscribe(args);
      break;
    default:
      console.log(MQTTHelp);
      break;
  }
}

processArgs(Deno.args);
