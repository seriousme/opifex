import { Deferred } from "./deferred.ts";
import { nextTick } from "./nextTick.ts";
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

export class AsyncQueue<T> {
  private queue: T[] = [];
  private maxQueueLength = Infinity;

  private done = false;

  #next?: Deferred<T>;

  constructor(maxQueueLength?: number) {
    if (maxQueueLength) {
      this.maxQueueLength = maxQueueLength;
    }
  }

  async next(): Promise<T> {
    await nextTick();
    if (this.queue.length) {
      return Promise.resolve(this.queue.shift()!);
    } else if (this.done) {
      return Promise.reject("Closed");
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

  async *[Symbol.asyncIterator](): AsyncGenerator<Awaited<T>, void, unknown> {
    while (true) {
      yield await this.next();
    }
  }

  push(item: T) {
    if (this.#next) {
      this.#next.resolve(item);
      this.#next = undefined;
      return;
    }
    if (this.queue.length > this.maxQueueLength) {
      this.queue.shift();
    }
    this.queue.push(item);
  }

  get isDone(): boolean {
    return this.done;
  }
}
