import { nextTick } from "./nextTick.ts";

export class AsyncQueue<T> {
  private queue: T[] = [];
  private maxQueueLength = Infinity;
  private nextResolve = (_value: T) => {};
  private nextReject = (_reason?: string) => {};
  private done = false;
  private hasNext = false;

  constructor(maxQueueLength?: number) {
    if (maxQueueLength) {
      this.maxQueueLength = maxQueueLength;
    }
  }

  async next(): Promise<T> {
    await nextTick();
    if (this.done && this.queue.length === 0) {
      return Promise.reject("Closed");
    }
    return new Promise((resolve, reject) => {
      if (this.queue.length > 0) {
        const item = this.queue.shift();
        if (item) {
          return resolve(item);
        }
      }
      this.nextResolve = resolve;
      this.nextReject = reject;
      this.hasNext = true;
    });
  }

  close(reason = "closed"): void {
    this.done = true;
    if (this.hasNext) {
      this.nextReject(reason);
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Awaited<T>, void, unknown> {
    while (true) {
      yield this.next();
    }
  }

  push(item: T) {
    if (this.hasNext) {
      this.nextResolve(item);
      this.hasNext = false;
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
