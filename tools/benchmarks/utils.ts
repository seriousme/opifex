import { parseArgs } from "node:util";
import { LogLevel } from "../../utils/mod.ts";
import type { QoS } from "../../client/mod.ts";

export async function importClientClass() {
  // @ts-ignore: the Deno global variable is not defined in @types/node,
  //             therefore we need to ignore this error because this file
  //             is meant to be used in both environments.
  const isDeno = typeof Deno !== "undefined";
  return isDeno
    ? (await import("../../deno/tcpClient.ts"))
    : (await import("../../node/tcpClient.ts"));
}

export function getArgs() {
  const benchMarkOpts = {
    url: { type: "string", short: "u", default: "mqtt://localhost:1883" },
    topic: { type: "string", short: "t", default: "benchmark" },
    qos: { type: "string", short: "q", default: "0" },
    logLevel: { type: "string", short: "l", default: "error" },
  } as const;

  const { values } = parseArgs({ options: benchMarkOpts });
  const url = values.url as string;
  const topic = values.topic as string;
  const qos = Number(values.qos ?? 0) as QoS;
  const logLevelKey = (values.logLevel ?? "error") as keyof typeof LogLevel;
  const level = LogLevel[logLevelKey] ?? LogLevel.error;

  return { url, topic, qos, level };
}
