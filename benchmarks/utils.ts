export async function importClientClass() {
// @ts-ignore: the Deno global variable is not defined in @types/node,
//             therefore we need to ignore this error because this file
//             is meant to be used in both environments.
const isDeno = typeof Deno !== "undefined";
  return isDeno
    ? (await import("../deno/tcpClient.ts"))
    : (await import("../node/tcpClient.ts"));
};


