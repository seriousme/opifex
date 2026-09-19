import { exit } from "node:process";
import { runAsap } from "../../dev_utils/timers.ts";
import { getArgs, importClientClass } from "./utils.ts";
import { logger } from "../../utils/mod.ts";
import type { TLogLevel } from "../../utils/logger.ts";
import type { QoS } from "../../client/deps.ts";

const { TcpClient } = await importClientClass();
const client = new TcpClient();
client.onError = (err: Error) => {
  console.log("client error", err);
  exit(1);
};

export async function runSender(
  level: TLogLevel,
  url: string,
  topic: string,
  qos: QoS,
) {
  logger.level(level);
  await client.connect({
    url: new URL(url),
  });

  const payload = new TextEncoder().encode("payload");
  let sent = 0;
  const interval = 5000;

  const loop = () => {
    sent++;
    client.publish({ topic, qos, payload })
      .then(() => runAsap(loop));
  };

  function count() {
    console.log("sent/s", (sent / interval) * 1000);
    sent = 0;
  }

  setInterval(count, interval);
  loop();
}

if (import.meta.main) {
  const { level, url, topic, qos } = getArgs();
  runSender(level, url, topic, qos);
}
