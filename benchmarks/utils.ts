
// This will also work on Deno:
// https://docs.deno.com/api/node/timers/#namespace_setimmediate
import { setImmediate } from 'node:timers';

import type { Client } from '../client/client.ts';

export type ClientClass = new () => Client;

export type Main = (clientClass: ClientClass) => Promise<void>;

export const loader = async (main: Main) => {
  // @ts-ignore
  if (typeof Deno !== 'undefined') {
    const { TcpClient } = await import('../deno/tcpClient.ts');
    try {
      await main(TcpClient);
    } catch (err) {
      console.error(err);
      // @ts-ignore
      Deno.exit(1);
    }
  } else {
    const { TcpClient } = await import('../node/tcpClient.ts');
    try {
      await main(TcpClient);
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  }
};

let taskCounter = 0;

export const runAsap = (fn: () => any) => {
  // For some reason I do not understand, Deno does not tolerate
  // setting this to anything higher than 64. Setting this to 100,
  // for example, leads to a constant decrease in actual tick/s.
  // Neither Node nor Bun exhibit the same behavior.
  if (taskCounter === 64) {
    taskCounter = 0;
    setImmediate(fn);
  } else {
    taskCounter++;
    queueMicrotask(fn);
  }
};
