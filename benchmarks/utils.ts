
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
