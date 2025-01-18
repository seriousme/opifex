/**
 * @returns a promise that resolves on the nextTick of the event loop
 */
export function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
