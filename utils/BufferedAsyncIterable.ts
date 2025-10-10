
import { Deferred } from "./deferred.ts";
import { ArrayQueue } from "./queue.ts";

/**
 * An Async Queue is a queue that can be used to push items to it and then wait
 * for them to be consumed.
 *
 * @example
 * ```ts
 * const queue = new AsyncQueue<string>();
 * queue.push("hello");
 * for await (const item of queue) {
 *   console.log(item); // "hello"
 * }
 * ```
 */
export class BufferedAsyncIterable<T> implements AsyncIterable<T> {

  private buffer: ArrayQueue<T>;
  private bufferSize: number;

  private done = false;

  #next?: Deferred<T>;

  constructor(bufferSize: number = 2048) {
    this.buffer = new ArrayQueue();
    this.bufferSize = bufferSize;
  }

  async* [Symbol.asyncIterator](): AsyncGenerator<Awaited<T>, void, unknown> {
    while (!this.done) {
      yield this.next();
    }
  }

  async next(): Promise<T> {
    // await nextTick();
    if (this.buffer.size() > 0) {
      return this.buffer.dequeue()!;
    } else if (this.done) {
      throw new Error("Closed");
    } else if (!this.#next) {
      this.#next = new Deferred<T>();
    }
    return this.#next.promise;
  }

  close(reason = "closed"): void {
    this.done = true;
    if (this.#next) {
      this.#next.reject(new Error(reason));
    }
  }

  readonly push = async (item: T): Promise<void> =>{
    if (this.#next) {
      this.#next.resolve(item);
      this.#next = undefined;
      return;
    }
    this.buffer.enqueue(item);
    if (this.buffer.size() > this.bufferSize) {
      // If our current buffer has grown greater than the allowed size we adaptively
      // wait for an amount of milliseconds proportional to the size of the buffer.
      // This ensures backpressure is applied to the producer that is pushing items
      // into the queue. Note that this might be an exceedingly simple heuristic,
      // a PID (Proportional-Integral-Derivative) controller could be used to improve
      // the responsiveness of the system.
      return new Promise(resolve => setTimeout(resolve, this.buffer.size()));
    }
  }

  get isDone(): boolean {
    return this.done;
  }
}
