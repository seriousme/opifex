// @ts-nocheck  ignore Typescript errors for unknow objects

export function getPlatform() {
  if (typeof Deno !== "undefined") {
    return "Deno";
  }
  if (typeof Bun !== "undefined") {
    return "Bun";
  }
  if (process?.release?.name === "node") {
    return "Node";
  }
}

export function getArgs() {
  if (typeof Deno !== "undefined") {
    return Deno.args;
  }
  if (typeof Bun !== "undefined") {
    return Bun.argv.slice(2);
  }
  return process.argv.slice(2);
}
