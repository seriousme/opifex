import type { ConnAddr, ConnNext } from "../connNext/connNext.ts";
import { createAsyncStreamPair } from "./asyncStreamPair.ts";
import { asyncStreamToNext } from "./asyncStreamToNext.ts";

export function createConnNextPair(): {
  input: ConnNext;
  output: ConnNext;
} {
  const { input: asyncInput, output: asyncOutput } = createAsyncStreamPair();

  const mockAddr: ConnAddr = {
    transport: "tcp",
    hostname: "127.0.0.1",
    port: 1883,
  };

  const inputWrapper = asyncStreamToNext(asyncInput);
  const outputWrapper = asyncStreamToNext(asyncOutput);

  const input: ConnNext = {
    remoteAddr: mockAddr,
    localAddr: mockAddr,
    read: (length: number | undefined) => inputWrapper.read(length),
    write: (data: Uint8Array<ArrayBufferLike>) => inputWrapper.write(data),
    [Symbol.asyncIterator]: () => inputWrapper[Symbol.asyncIterator](),
    close: () => {
      inputWrapper.close();
      outputWrapper.close();
    },
  };

  const output: ConnNext = {
    remoteAddr: mockAddr,
    localAddr: mockAddr,
    read: (length: number | undefined) => outputWrapper.read(length),
    write: (data: Uint8Array<ArrayBufferLike>) => outputWrapper.write(data),
    [Symbol.asyncIterator]: () => outputWrapper[Symbol.asyncIterator](),
    close: () => {
      outputWrapper.close();
      inputWrapper.close();
    },
  };

  return { input, output };
}
