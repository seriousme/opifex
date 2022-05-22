import { parse } from 'https://deno.land/std@0.140.0/flags/mod.ts';
import { Client, DEFAULTURL } from '../client/client.ts';

const logger = console.log;
const client = new Client(logger);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const MQTTHelp = `MQTT.ts command line interface, available commands are:

    * publish     publish a message to the broker
    * subscribe   subscribe for updates from the broker

Launch 'mqtt.ts [command] --help' to know more about the commands.`;

const ConnectHelp = `
  -u/--url        the URL to connect to: default is ${DEFAULTURL}
  -i/--clientId   the clientId to connect to the server
  -U/--username   the username to connect to the server
  -P/--password   the password to connect to the server
  -c/--certFile   the path to a certFile
  -h/--help       this text
  `

const PublishHelp = `Usage: MQTT.ts publish <options>

Where options are:
  -t/--topic      the topic to use
  -m/--message    the message to send
  -q/--qos        the QoS (0/1/2) to use
  -r/--retain     if the message should be retained
${ConnectHelp}
Example: MQTT.ts publish -t hello -m world`;

const connectOpts = {
  string: [
    'url',
    'username',
    'password',
    'certFile',
    'clientId',
  ],
  alias: {
    u: 'url',
    U: 'username',
    P: 'password',
    c: 'certFile',
    i: 'clientId',
    h: 'help'
  },
  boolean: ['help']
};


async function subscribe(args: any) {
  try {
    const connack = await client.connect(args);
    await client.disconnect();
    logger('Disconnected !');
  } catch (err) {
    logger(err.message);
  }
}

const publishOpts = {
  string: [
    'topic',
    'message',
  ],
  boolean: ['retain', 'help'],
  alias: {
    t: 'topic',
    m: 'message',
    q: 'qos',
    r: 'retain',
  },
  default: {
    qos: 0,
    dup: false,
    retain: false,
    topic: '',
    message: '',
  },
};

async function publish(args:string[]) {
  const connectArgs = parse(Deno.args, connectOpts)
  const publishArgs = parse(Deno.args, publishOpts)
  if (connectArgs.help){
    console.log(PublishHelp)
    return;
  }
  if (publishArgs.topic === undefined) {
    console.log('Missing `topic`');
    return;
  }
  try {
    await client.connect({
      url: connectArgs.url,
      certFile: connectArgs.certFile,
      options:{
        username: connectArgs.username,
        password: connectArgs.password,
        clientId: connectArgs.clientId,
      }
    });
    logger('Connected !');
    await client.publish({
      topic: publishArgs.topic,
      payload: encoder.encode(publishArgs.message),
      retain: publishArgs.retain,
      qos: publishArgs.qos,
    });
    logger('Published!');
    client.disconnect();
    logger('Disconnected !');
  } catch (err) {
    logger(err.message);
  }
}

function processArgs(args: any) {
  const cmd = args[0];
  switch (cmd) {
    case 'publish':
      publish(args);
      break;
    case 'subscribe':
      subscribe(args);
      break;
    default:
      console.log(MQTTHelp);
      break;
  }
}

processArgs(Deno.args);
