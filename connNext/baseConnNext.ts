import type { ConnAddr, ConnNext } from "../connNext/connNext.ts";

export abstract class BaseConnNext implements ConnNext {
  abstract remoteAddr?: ConnAddr;
  abstract localAddr?: ConnAddr;

  protected chunks: Uint8Array[] = [];
  protected queueOffset = 0;
  protected closed = false;
  private isPulling = false;

  abstract write(data: Uint8Array): Promise<void>;
  abstract close(): void;

  /** Specifiek per bron: haal pas daadwerkelijk 1 chunk op als de basisklasse erom vraagt */
  protected abstract pullNextChunk(): Promise<Uint8Array | null>;

  isClosed(): boolean {
    return this.closed;
  }

  protected getBufferedBytes(): number {
    let total = 0;
    for (let i = 0; i < this.chunks.length; i++) {
      total += i === 0
        ? this.chunks[i]!.byteLength - this.queueOffset
        : this.chunks[i]!.byteLength;
    }
    return total;
  }

  /** Zorgt ervoor dat we data ophalen op exact het moment dat het nodig is */
  private async ensureData(length?: number): Promise<void> {
    while (
      !this.closed &&
      (this.getBufferedBytes() === 0 ||
        (length !== undefined && this.getBufferedBytes() < length))
    ) {
      if (this.isPulling) {
        // Voorkom gelijktijdige pulls als er al eentje loopt
        await new Promise((resolve) => setTimeout(resolve, 5));
        continue;
      }

      this.isPulling = true;
      try {
        const chunk = await this.pullNextChunk();
        if (chunk === null || chunk.byteLength === 0) {
          this.closed = true;
          break;
        }
        this.chunks.push(chunk);
      } catch {
        this.closed = true;
      } finally {
        this.isPulling = false;
      }
    }
  }

  async read(length?: number): Promise<Uint8Array | null> {
    if (this.closed && this.getBufferedBytes() === 0) {
      return null;
    }

    if (length === 0) {
      return new Uint8Array(0);
    }

    // Pull exact zolang tot we genoeg data hebben voor deze read()
    await this.ensureData(length);

    if (this.getBufferedBytes() === 0) {
      return null;
    }

    // Onbegrensd lezen (geen lengte opgegeven)
    if (length === undefined) {
      const firstChunk = this.chunks.shift()!;
      const result = firstChunk.subarray(this.queueOffset);
      this.queueOffset = 0;
      return result;
    }

    // Exacte lengte uitlezen uit de buffer
    const bytesToTake = Math.min(length, this.getBufferedBytes());
    const result = new Uint8Array(bytesToTake);
    let bytesCopied = 0;

    while (bytesCopied < bytesToTake && this.chunks.length > 0) {
      const currentChunk = this.chunks[0]!;
      const bytesNeeded = bytesToTake - bytesCopied;
      const bytesAvailable = currentChunk.byteLength - this.queueOffset;

      if (bytesAvailable <= bytesNeeded) {
        result.set(currentChunk.subarray(this.queueOffset), bytesCopied);
        bytesCopied += bytesAvailable;
        this.chunks.shift();
        this.queueOffset = 0;
      } else {
        result.set(
          currentChunk.subarray(
            this.queueOffset,
            this.queueOffset + bytesNeeded,
          ),
          bytesCopied,
        );
        bytesCopied += bytesNeeded;
        this.queueOffset += bytesNeeded;
      }
    }

    return bytesCopied === 0 ? null : result;
  }

  async *[Symbol.asyncIterator]() {
    while (true) {
      const chunk = await this.read();
      if (chunk === null) break;
      yield chunk;
    }
  }
}
