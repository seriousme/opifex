/*
 * This file contains timer functions that support all major JS runtimes
 * (Deno, Bun, Node.js).
 */

// This will also work on Deno:
// https://docs.deno.com/api/node/timers/#namespace_setimmediate
import { setImmediate } from "node:timers";

let taskCounter = 0;

/**
 * This function runs a function asynchronously but as soon as possible.
 * In most cases, this means as an additional microtask within the same
 * tick of the event loop via `queueMicrotask()`. However, in order not to
 * block the event loop in case of task loops, every 64 invocations we use
 * `setImmediate()` instead of `queueMicrotask()`.
 *
 * For some reason I do not understand, Deno does not tolerate anything more
 * than 64 subsequent invocations of `queueMicrotask()`. Setting this limit to
 * 100, for example, leads to a constant decrease in actual tick/s. Neither
 * Node nor Bun exhibit the same behavior.
 *
 * See https://nodejs.org/en/learn/asynchronous-work/understanding-setimmediate
 * See https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide
 */
export const runAsap = (fn: () => void): void => {
  if (taskCounter === 64) {
    taskCounter = 0;
    setImmediate(fn);
  } else {
    taskCounter++;
    queueMicrotask(fn);
  }
};

/**
 * Returns a promise that resolves asynchronously but as soon as possible.
 * Internally, this function uses `runAsap()` to schedule the resolution.
 * See above for more details on the scheduling strategy.
 */
export const resolveAsap = (): Promise<void> => {
  return new Promise((resolve) => runAsap(resolve));
};

/**
 * Returns a promise that resolves in the next tick of the event loop.
 */
export const resolveNextTick = (): Promise<void> => {
  return new Promise((resolve) => setImmediate(resolve));
};
