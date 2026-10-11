import type { ConnAddr, ConnNext } from "../connNext/connNext.ts";
import { createWebStreamPair } from "./webStreamPair.ts";
import { webStreamToNext } from "./webStreamToNext.ts";

/**
 * Creates a pair of cross-connected ConnNext sockets backed by WebStreams.
 */
export function createConnNextPair(): {
  input: ConnNext;
  output: ConnNext;
} {
  const { input: webInput, output: webOutput } = createWebStreamPair();

  const mockAddr: ConnAddr = {
    transport: "tcp",
    hostname: "127.0.0.1",
    port: 1883,
  };

  const inputWrapper = webStreamToNext(webInput);
  const outputWrapper = webStreamToNext(webOutput);

  const input: ConnNext = {
    remoteAddr: mockAddr,
    localAddr: mockAddr,
    read: (length) => inputWrapper.read(length),
    write: (data) => inputWrapper.write(data),
    [Symbol.asyncIterator]: () => inputWrapper[Symbol.asyncIterator](),
    close: () => {
      inputWrapper.close();
      outputWrapper.close();
    },
  };

  const output: ConnNext = {
    remoteAddr: mockAddr,
    localAddr: mockAddr,
    read: (length) => outputWrapper.read(length),
    write: (data) => outputWrapper.write(data),
    [Symbol.asyncIterator]: () => outputWrapper[Symbol.asyncIterator](),
    close: () => {
      outputWrapper.close();
      inputWrapper.close();
    },
  };

  return { input, output };
}
