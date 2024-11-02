import { argv } from "node:process";
import { Writable } from "node:stream";

function formatValue(key, value, boolean, string) {
  if (key === "__proto__" || key === "constructor") {
    throw new Error(`Invalid argument: ${key}`);
  }
  if (boolean.includes(key)) {
    if (value !== "false") {
      return true;
    }
    return false;
  }
  if (!string.includes(key)) {
    const num = Number(value);
    if (!Number.isNaN(num)) {
      return num;
    }
  }
  return value;
}
function parseKeyValue(arg, alias) {
  if (arg.startsWith("--no-")) {
    const key = arg.slice(5);
    return [key, false];
  }
  if (arg.startsWith("--")) {
    const [key, value] = arg.slice(2).split("=", 2);
    return [key, value];
  }
  if (arg.startsWith("-")) {
    const [flag, value] = arg.slice(1).split("=", 2);
    const key = alias[flag] || flag;
    return [key, value];
  }
  return ["_", arg];
}
function parseArgs(args, opts = {}) {
  const { alias = {}, boolean = [], string = [], default: defaults = {} } =
    opts;
  const result = { ...defaults };
  result["_"] = [];
  for (let i = 0; i < args.length; i++) {
    const [key, value] = parseKeyValue(args[i], alias);
    if (key === "_") {
      result["_"].push(formatValue(key, value, boolean, string));
      continue;
    }
    if (value === void 0) {
      const nextArg = args[i + 1];
      if (
        nextArg !== void 0 && !nextArg.startsWith("-") && !boolean.includes(key)
      ) {
        result[key] = formatValue(key, nextArg, boolean, string);
        i++;
      } else {
        result[key] = formatValue(key, value, boolean, string);
      }
      continue;
    }
    result[key] = formatValue(key, value, boolean, string);
  }
  return result;
}

function getArgs() {
  return argv.slice(2);
}

function closer(sock) {
  if (!sock.closed) {
    sock.end();
  }
}
function wrapNodeSocket(socket) {
  const readable = new ReadableStream(
    {
      type: "bytes",
      start(controller) {
        socket.on("data", (data) => {
          controller.enqueue(data);
          const desiredSize = controller.desiredSize ?? 0;
          if (desiredSize <= 0) {
            socket.pause();
          }
        });
        socket.on("error", (err) => controller.error(err));
        socket.on("end", () => {
          controller.byobRequest?.respond(1);
          controller.close();
        });
      },
      pull: () => {
        socket.resume();
      },
      cancel: () => {
        socket.end();
      },
    },
  );
  const writable = Writable.toWeb(socket);
  const remoteAddr = {
    hostname: socket.remoteAddress || "",
    port: socket.remotePort || 0,
  };
  const conn = {
    readable,
    writable,
    closer: () => closer(socket),
    remoteAddr,
  };
  return conn;
}

export { getArgs as g, parseArgs as p, wrapNodeSocket as w };
