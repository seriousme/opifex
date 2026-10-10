import type { ConnNext } from "../connNext/connNext.ts";

export async function webSocketToNext(ws: WebSocket): Promise<ConnNext> {
  ws.binaryType = "arraybuffer";

  const messageQueue: Uint8Array[] = [];
  let queueOffset = 0;
  const readResolvers: Array<() => void> = [];

  const notifyWaiters = () => {
    while (readResolvers.length > 0) {
      const resolve = readResolvers.shift();
      resolve?.();
    }
  };

  // helper to check if websocket is Open
  const ensureOpen = (): Promise<void> => {
    if (ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (ws.readyState >= WebSocket.CLOSING) {
      return Promise.reject(new Error("WebSocket is closing or closed"));
    }
    return new Promise((resolve, reject) => {
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = (err: Event) => {
        cleanup();
        reject(err);
      };
      const onClose = () => {
        cleanup();
        reject(new Error("WebSocket closed before opening"));
      };
      const cleanup = () => {
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("error", onError);
        ws.removeEventListener("close", onClose);
      };

      ws.addEventListener("open", onOpen);
      ws.addEventListener("error", onError);
      ws.addEventListener("close", onClose);
    });
  };

  ws.addEventListener("message", (event: MessageEvent) => {
    let chunk: Uint8Array;
    if (typeof event.data === "string") {
      chunk = new TextEncoder().encode(event.data);
    } else if (event.data instanceof ArrayBuffer) {
      chunk = new Uint8Array(event.data);
    } else {
      return;
    }
    messageQueue.push(chunk);
    notifyWaiters();
  });

  ws.addEventListener("close", notifyWaiters);
  ws.addEventListener("error", notifyWaiters);

  const getBufferedBytes = (): number => {
    let total = 0;
    for (let i = 0; i < messageQueue.length; i++) {
      total += i === 0
        ? messageQueue[i]!.byteLength - queueOffset
        : messageQueue[i]!.byteLength;
    }
    return total;
  };

  const waitForData = (): Promise<void> => {
    return new Promise<void>((resolve) => {
      readResolvers.push(resolve);
    });
  };

  const connNext = {
    remoteAddr: undefined,
    localAddr: undefined,

    async read(length?: number): Promise<Uint8Array | null> {
      try {
        await ensureOpen();
      } catch {
        return null;
      }

      if (getBufferedBytes() === 0 && ws.readyState >= WebSocket.CLOSING) {
        return null;
      }

      while (getBufferedBytes() === 0) {
        if (ws.readyState >= WebSocket.CLOSING) return null;
        await waitForData();
      }

      if (length === undefined) {
        const firstChunk = messageQueue.shift()!;
        const result = firstChunk.subarray(queueOffset);
        queueOffset = 0;
        return result;
      }

      while (getBufferedBytes() < length) {
        if (ws.readyState >= WebSocket.CLOSING) {
          return null;
        }
        await waitForData();
      }

      const result = new Uint8Array(length);
      let bytesCopied = 0;

      while (bytesCopied < length && messageQueue.length > 0) {
        const currentChunk = messageQueue[0]!;
        const bytesNeeded = length - bytesCopied;
        const bytesAvailable = currentChunk.byteLength - queueOffset;

        if (bytesAvailable <= bytesNeeded) {
          result.set(currentChunk.subarray(queueOffset), bytesCopied);
          bytesCopied += bytesAvailable;
          messageQueue.shift();
          queueOffset = 0;
        } else {
          result.set(
            currentChunk.subarray(queueOffset, queueOffset + bytesNeeded),
            bytesCopied,
          );
          bytesCopied += bytesNeeded;
          queueOffset += bytesNeeded;
        }
      }

      return result;
    },

    async write(data: Uint8Array): Promise<void> {
      await ensureOpen();

      if (data instanceof Uint8Array) {
        ws.send(data.buffer as ArrayBuffer);
      } else {
        ws.send(data);
      }

      const HIGH_WATER_MARK = 64 * 1024;
      while (ws.bufferedAmount > HIGH_WATER_MARK) {
        if (ws.readyState >= WebSocket.CLOSING) {
          throw new Error("WebSocket closed while writing");
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    },

    close(): void {
      try {
        ws.close();
      } catch {
        /* swallow */
      }
      notifyWaiters();
    },

    async *[Symbol.asyncIterator]() {
      while (true) {
        const chunk = await this.read();
        if (chunk === null) break;
        yield chunk;
      }
    },
  };

  await ensureOpen();
  return connNext;
}
