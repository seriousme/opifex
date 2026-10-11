import { BaseConnNext } from "../connNext/baseConnNext.ts";
import type { AsyncStreamEndpoint } from "./asyncStreamEndpoint.ts";

export class AsyncStreamConnNext extends BaseConnNext {
  remoteAddr = undefined;
  localAddr = undefined;
  private reader: AsyncIterator<Uint8Array>;
  private endPoint: AsyncStreamEndpoint;

  constructor(endPoint: AsyncStreamEndpoint) {
    super();
    this.endPoint = endPoint;
    // Haal de async iterator op uit de readable stream
    this.reader = endPoint.readable[Symbol.asyncIterator]();
  }

  /**
   * Haalt op exact moment van aanvragen één nieuwe chunk op via de iterator.
   */
  protected async pullNextChunk(): Promise<Uint8Array | null> {
    if (this.closed) {
      return null;
    }

    try {
      const { value, done } = await this.reader.next();
      if (done || !value) {
        this.closed = true;
        return null;
      }
      return value;
    } catch {
      this.closed = true;
      return null;
    }
  }

  async write(chunk: Uint8Array): Promise<void> {
    if (this.closed) {
      return Promise.reject(new Error("Pipe closed"));
    }
    try {
      await this.endPoint.write(chunk);
    } catch (err) {
      this.closed = true;
      throw err;
    }
  }

  close(): void {
    if (!this.closed) {
      this.closed = true;
      try {
        this.endPoint.close();
      } catch (_err) {
        /* swallow */
      }
    }
  }
}

export function asyncStreamToNext(endPoint: AsyncStreamEndpoint) {
  return new AsyncStreamConnNext(endPoint);
}
