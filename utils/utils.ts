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

export const noop = (...args: any) => {};

export function nextTick(fn: (...args: any[]) => void){
  setTimeout(fn, 0);
}

export const debug = {
  info: console.info,
  log: console.log,
};
