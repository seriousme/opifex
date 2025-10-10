/**
 * Returns a promise that resolves on the next tick of the Node.js event loop.
 * This is useful for deferring execution of code until after the current call stack is cleared.
 *
 * @example
 * ```ts
 * async function example() {
 *   console.log('Before nextTick');
 *   await nextTick();
 *   console.log('After nextTick');
 * }
 * ```
 *
 * @returns {Promise<void>} A promise that resolves on the next tick of the event loop
 */

let counter = 0;

export function nextTick(): Promise<void> {
  return new Promise((resolve) => {
    if (counter === 100) {
      setImmediate(resolve);
      counter = 0;
    } else {
      queueMicrotask(resolve);
      counter += 1;
    }
  });
}
