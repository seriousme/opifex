import type { Client } from "../client/client.ts";

export type ClientClass = new () => Client;

export type Main = (clientClass: ClientClass) => void | Promise<void>;

// @ts-ignore: the Deno global variable is not defined in @types/node,
//             therefore we need to ignore this error because this file
//             is meant to be used in both environments.
const isDeno = typeof Deno !== "undefined";

// @ts-ignore: the Deno global variable is not defined in @types/node,
//             therefore we need to ignore this error because this file
//             is meant to be used in both environments.
// deno-lint-ignore no-process-global
const exit = isDeno ? Deno.exit : process.exit;

const importClientClass = async (): Promise<ClientClass> => {
  return isDeno
    ? (await import("../deno/tcpClient.ts")).TcpClient
    : (await import("../node/tcpClient.ts")).TcpClient;
};

export const loader = async (main: Main) => {
  const TcpClient = await importClientClass();
  try {
    await main(TcpClient);
  } catch (err) {
    console.error(err);
    exit(1);
  }
};
