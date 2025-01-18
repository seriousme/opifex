/**
 * Create a promise that can be resolved/rejected later
 */

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
