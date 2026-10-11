import type { ConnAddr, ConnNext } from "../connNext/connNext.ts";
import { BaseConnNext } from "../connNext/baseConnNext.ts";
import { delay } from "../utils/utils.ts";

export class WebSocketConnNext extends BaseConnNext {
  localAddr = undefined;
  remoteAddr?: ConnAddr;

  private ws: WebSocket;
  private messageQueue: Uint8Array[] = [];
  private maxBufferSize: number;
  private currentBufferSize = 0;
  private readResolvers: Array<() => void> = [];

  constructor(
    ws: WebSocket,
    remoteAddr?: ConnAddr,
    maxBufferSize = 1 * 1024 * 1024,
  ) {
    super();
    this.ws = ws;
    this.remoteAddr = remoteAddr;
    this.maxBufferSize = maxBufferSize;
    this.ws.binaryType = "arraybuffer";

    this.ws.addEventListener("message", (event: MessageEvent) => {
      let chunk: Uint8Array;
      if (typeof event.data === "string") {
        chunk = new TextEncoder().encode(event.data);
      } else if (event.data instanceof ArrayBuffer) {
        chunk = new Uint8Array(event.data);
      } else {
        return;
      }

      // Check the bufferlimit (Throttling / Overflow protection)
      if (this.currentBufferSize + chunk.byteLength > this.maxBufferSize) {
        this.close();
        throw new Error(
          "WebSocket buffer overflow: Too much unread data from push source",
        );
      }

      this.messageQueue.push(chunk);
      this.currentBufferSize += chunk.byteLength;
      this.notifyWaiters();
    });

    const onClose = () => {
      this.closed = true;
      this.notifyWaiters();
    };
    this.ws.addEventListener("close", onClose);
    this.ws.addEventListener("error", onClose);
  }

  private notifyWaiters() {
    while (this.readResolvers.length > 0) {
      const resolve = this.readResolvers.shift();
      resolve?.();
    }
  }

  private waitForData(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.readResolvers.push(resolve);
    });
  }

  ensureOpen(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (this.ws.readyState >= WebSocket.CLOSING) {
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
        this.ws.removeEventListener("open", onOpen);
        this.ws.removeEventListener("error", onError);
        this.ws.removeEventListener("close", onClose);
      };

      this.ws.addEventListener("open", onOpen);
      this.ws.addEventListener("error", onError);
      this.ws.addEventListener("close", onClose);
    });
  }

  protected async pullNextChunk(): Promise<Uint8Array | null> {
    if (this.messageQueue.length === 0) {
      await this.waitForData();
    }
    if (this.closed) {
      return null;
    }
    const chunk = this.messageQueue.shift()!;
    this.currentBufferSize -= chunk.byteLength;
    return chunk;
  }

  async write(data: Uint8Array): Promise<void> {
    if (this.isClosed()) throw new Error("WebSocket is closed");
    this.ws.send(data.buffer as ArrayBuffer);

    // Check WebSocket bufferedAmount for write-backpressure
    const HIGH_WATER_MARK = 64 * 1024;
    while (this.ws.bufferedAmount > HIGH_WATER_MARK) {
      if (this.isClosed()) throw new Error("WebSocket closed while writing");
      await delay(10);
    }
  }

  close(): void {
    if (!this.closed) {
      this.closed = true;
      try {
        this.ws.close();
      } catch {
        /* swallow */
      }
    }
  }
}

export async function webSocketToNext(
  ws: WebSocket,
  remoteAddr?: ConnAddr,
  maxBufferSize?: number,
): Promise<ConnNext> {
  const connNext = new WebSocketConnNext(ws, remoteAddr, maxBufferSize);
  await connNext.ensureOpen();
  return connNext;
}
