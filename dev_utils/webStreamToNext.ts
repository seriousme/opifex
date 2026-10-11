import { BaseConnNext } from "../connNext/baseConnNext.ts";
import type { WebStreamEndpoint } from "./WebStreamEndpoint.ts";

export class WebStreamConnNext extends BaseConnNext {
  remoteAddr = undefined;
  localAddr = undefined;
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;

  constructor(private endPoint: WebStreamEndpoint) {
    super();
    this.reader = endPoint.readable.getReader();
    this.writer = endPoint.writable.getWriter();
    this.reader.closed.catch(() => {});
    this.writer.closed.catch(() => {});
  }

  protected async pullNextChunk(): Promise<Uint8Array | null> {
    try {
      const { value, done } = await this.reader.read();
      if (done || !value) {
        return null;
      }
      return value;
    } catch {
      return null;
    }
  }

  async write(chunk: Uint8Array): Promise<void> {
    if (this.closed) throw new Error("Pipe closed");
    await this.writer.write(chunk);
  }

  close(): void {
    if (!this.closed) {
      this.closed = true;
      try {
        void this.reader.cancel().catch(() => {});
        this.reader.releaseLock();
      } catch { /* swallow */ }
      void this.writer.close().catch(() => {});
      try {
        this.endPoint.close();
      } catch { /* swallow */ }
    }
  }
}

export function webStreamToNext(endPoint: WebStreamEndpoint) {
  return new WebStreamConnNext(endPoint);
}
