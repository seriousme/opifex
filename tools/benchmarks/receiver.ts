import { exit } from "node:process";
import { getArgs, importClientClass } from "./utils.ts";
import { logger } from "../../utils/mod.ts";
import type { TLogLevel } from "../../utils/logger.ts";
import type { QoS } from "../../client/deps.ts";

export async function runReceiver(
  level: TLogLevel,
  url: string,
  topic: string,
  qos: QoS,
) {
  logger.level(level);
  const { TcpClient } = await importClientClass();
  const client = new TcpClient();
  client.onError = (err: Error) => {
    console.log("client error", err);
    exit(1);
  };

  await client.connect({
    url: new URL(url),
  });

  await client.subscribe({ subscriptions: [{ topicFilter: topic, qos }] });

  let counter = 0;
  const interval = 5000;

  function count() {
    console.log("received/s", (counter / interval) * 1000);
    counter = 0;
  }

  setInterval(count, interval);

  // // Consume using a callback
  // client.onPacket = async (packet) => {
  //   counter++;
  // };

  // Consume using an AsyncIterator
  for await (const _ of client.messages()) {
    counter++;
  }
}

if (import.meta.main) {
  const { level, url, topic, qos } = getArgs();
  runReceiver(level, url, topic, qos);
}
