/*
 * This file contains utilities used throughout the project too small to
 * deserve their own dedicated files.
 */

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const noop = () => {};
