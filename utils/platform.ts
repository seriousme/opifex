import { argv } from "node:process";
export function getArgs() {
  return argv.slice(2);
}
