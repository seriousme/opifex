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

export async function nextTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export class AsyncQueue<T> {
  private queue: T[] = [];
  private maxQueueLength = Infinity;
  private nextResolve = (value: T) => {};
  private nextReject = (reason?: any) => {};
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

  close(reason='closed'): void {
    this.done = true;
    if (this.hasNext){
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

export enum LogLevel {
  error = 0,
  warn = 1,
  info = 2,
  verbose = 3,
  debug = 4,
}

class Logger {
  private defaultError = console.error;
  private defaultWarn = console.warn;
  private defaultInfo = console.info;
  private defaultVerbose = console.log;
  private defaultDebug = console.log;
  private noop = (...data: any[]) => {};
  error = this.defaultError;
  warn = this.defaultWarn;
  info = this.defaultInfo;
  verbose = this.noop;
  debug = this.noop;

  constructor() {
  }

  level(logLevel: LogLevel) {
    this.warn = logLevel > 0 ? this.defaultWarn : this.noop;
    this.info = logLevel > 1 ? this.defaultInfo : this.noop;
    this.verbose = logLevel > 2 ? this.defaultVerbose : this.noop;
    this.debug = logLevel > 3 ? this.defaultDebug : this.noop;
  }
}

export const logger = new Logger();
