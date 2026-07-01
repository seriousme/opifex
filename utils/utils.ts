/*
 * This file contains utilities used throughout the project too small to
 * deserve their own dedicated files.
 */

import { setTimeout as delay } from "node:timers/promises";
export { delay };

export const noop = () => {};
