/**
 *  Duplex AsyncStream
 */

import type { AsyncStreamEndpoint } from "./asyncStreamEndpoint.ts";
/**
 * Internal push/pull queue to support AsyncIterable iteration.
 */
class AsyncQueue<T> implements AsyncIterable<T> {
  private queue: T[] = [];
  private resolvers: Array<(value: IteratorResult<T>) => void> = [];
  private closed = false;
  private error: unknown = null;

  push(value: T): void {
    if (this.closed) return;

    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve({ value, done: false });
    } else {
      this.queue.push(value);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;

    while (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      if (this.error) {
        resolve(Promise.reject(this.error) as unknown as IteratorResult<T>);
      } else {
        resolve({ value: undefined, done: true });
      }
    }
  }

  abort(reason: unknown): void {
    this.error = reason;
    this.close();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      if (this.queue.length > 0) {
        yield this.queue.shift()!;
      } else if (this.closed) {
        if (this.error) {
          throw this.error;
        }
        return;
      } else {
        const nextResult = await new Promise<IteratorResult<T>>((resolve) => {
          this.resolvers.push(resolve);
        });

        if (nextResult.done) {
          if (this.error) {
            throw this.error;
          }
          return;
        }

        yield nextResult.value;
      }
    }
  }
}

export function createAsyncStreamPair(): {
  input: AsyncStreamEndpoint;
  output: AsyncStreamEndpoint;
} {
  const queueA = new AsyncQueue<Uint8Array>();
  const queueB = new AsyncQueue<Uint8Array>();

  let closed = false;

  const closeBoth = () => {
    if (!closed) {
      closed = true;
      queueA.close();
      queueB.close();
    }
  };

  return {
    input: {
      readable: queueA,
      write: (chunk: Uint8Array): Promise<void> => {
        if (closed) throw new Error("Stream is closed");
        queueB.push(chunk);
        return Promise.resolve();
      },
      close: closeBoth,
    },
    output: {
      readable: queueB,
      write: (chunk: Uint8Array): Promise<void> => {
        if (closed) throw new Error("Stream is closed");
        queueA.push(chunk);
        return Promise.resolve();
      },
      close: closeBoth,
    },
  };
}
