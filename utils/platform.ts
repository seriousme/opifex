import { argv } from "node:process";
export function getArgs(): string[] {
  return argv.slice(2);
}
