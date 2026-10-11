import type { ConnAddr, ConnNext } from "../connNext/connNext.ts";
import { createAsyncStreamPair } from "./asyncStreamPair.ts";
import { AsyncStreamConnNext } from "./asyncStreamToNext.ts";

/**
 * Creates an in-memory mock ConnNext object for unit testing.
 *
 * @param readerBuffs List of Uint8Arrays containing incoming test data
 * @param writerBuf Buffer where outgoing data should be written
 * @param close Optional callback executed on closure
 */
export function createMockConn(
  readerBuffs: Uint8Array[],
  writerBuf: Uint8Array,
  close = () => {},
): ConnNext {
  // Maak een async stream pair aan
  const { input, output } = createAsyncStreamPair();

  const mockAddr: ConnAddr = {
    transport: "tcp",
    hostname: "127.0.0.1",
    port: 1883,
  };

  // Push all input directly to the input of the StreamPair
  (async () => {
    try {
      for (const buf of readerBuffs) {
        await input.write(buf);
      }
      input.close();
    } catch {
      // ignore errors
    }
  })();

  // Capture written data and store it in the write buffer
  (async () => {
    try {
      let writerPos = 0;
      for await (const chunk of input.readable) {
        writerBuf.set(chunk, writerPos);
        writerPos += chunk.byteLength;
      }
    } catch {
      // ignore errors
    }
  })();

  // Return a ConnNext wrapper connected to the output side
  const wrapper = new AsyncStreamConnNext(output);

  return {
    remoteAddr: mockAddr,
    localAddr: mockAddr,
    read: (length) => wrapper.read(length),
    write: (data) => wrapper.write(data),
    [Symbol.asyncIterator]: () => wrapper[Symbol.asyncIterator](),
    close: () => {
      wrapper.close();
      output.close();
      close();
    },
  };
}
