export class Deferred<T> {
  promise: Promise<T>;
  resolve!: (val: T) => void;
  reject!: (err: Error) => void;

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

export class AsyncQueue<T> {
  private queue: T[] = [];
  private maxQueueLength = Infinity;
  private nextResolve = (value: T) => {};
  private hasNext = false;

  constructor(maxQueueLength?: number) {
    if (maxQueueLength) {
      this.maxQueueLength = maxQueueLength;
    }
  }

  async *[Symbol.asyncIterator]() {
    while (true) {
      yield new Promise((resolve) => {
        if (this.queue.length > 0) {
          return resolve(this.queue.shift());
        }
        this.nextResolve = resolve;
        this.hasNext = true;
      });
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
}

export const debug = {
  info: console.info,
  log: console.log,
};
