import type { ConnAddr, ConnNext } from "../connNext/connNext.ts";

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
  let readIndex = 0;
  let readOffset = 0;
  let writerPos = 0;
  let isClosed = false;

  // Helper function to calculate total remaining bytes across readerBuffs
  const getRemainingBytes = (): number => {
    let total = 0;
    for (let i = readIndex; i < readerBuffs.length; i++) {
      total += i === readIndex
        ? readerBuffs[i].byteLength - readOffset
        : readerBuffs[i].byteLength;
    }
    return total;
  };

  const mockAddr: ConnAddr = {
    transport: "tcp",
    hostname: "127.0.0.1",
    port: 1883,
  };

  return {
    remoteAddr: mockAddr,
    localAddr: mockAddr,

    /**
     * Read exactly 'length' bytes from the provided readerBuffs
     */
    read(length?: number): Promise<Uint8Array | null> {
      if (isClosed) return Promise.resolve(null);

      // No specific length requested: return the next available chunk immediately
      if (length === undefined) {
        if (readIndex >= readerBuffs.length) Promise.resolve(null);
        const chunk = readerBuffs[readIndex].subarray(readOffset);
        readIndex++;
        readOffset = 0;
        Promise.resolve(chunk);
      }

      length = length ?? 0;

      // EOF reached / not enough remaining bytes in the mock buffers
      if (getRemainingBytes() < length) {
        return Promise.resolve(null);
      }

      const result = new Uint8Array(length);
      let bytesCopied = 0;

      while (bytesCopied < length && readIndex < readerBuffs.length) {
        const current = readerBuffs[readIndex];
        const available = current.byteLength - readOffset;
        const needed = length - bytesCopied;

        if (available <= needed) {
          result.set(current.subarray(readOffset), bytesCopied);
          bytesCopied += available;
          readIndex++;
          readOffset = 0;
        } else {
          result.set(
            current.subarray(readOffset, readOffset + needed),
            bytesCopied,
          );
          bytesCopied += needed;
          readOffset += needed;
        }
      }

      return Promise.resolve(result);
    },

    /**
     * Write data directly at the current offset in writerBuf
     */
    write(data: Uint8Array): Promise<void> {
      if (isClosed) {
        throw new Error("Connection closed");
      }
      writerBuf.set(data, writerPos);
      writerPos += data.byteLength;
      return Promise.resolve();
    },

    /**
     * Close the mock connection
     */
    close(): void {
      if (!isClosed) {
        isClosed = true;
        close();
      }
    },

    /**
     * Async iterator for streaming test scenarios
     */
    async *[Symbol.asyncIterator]() {
      while (true) {
        const chunk = await this.read();
        if (chunk === null) break;
        yield chunk;
      }
    },
  };
}
