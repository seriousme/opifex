import { argv } from "node:process";

/**
 * @returns an array of command line arguments
 */
export function getArgs(): string[] {
  return argv.slice(2);
}
