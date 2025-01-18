/**
 * Parsed arguments as key value
 */
// deno-lint-ignore no-explicit-any
export type Args = Record<string, any>;
export type ArgsValue = string | number | boolean;

type ArgOpts = {
  string?: string[];
  boolean?: string[];
  alias?: Record<string, string>;
  default?: Args;
};

function formatValue(
  key: string,
  value: ArgsValue,
  boolean: string[],
  string: string[],
): string | number | boolean {
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

function parseKeyValue(
  arg: string,
  alias: Record<string, string>,
): [string, ArgsValue] {
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

/**
 *  a parser for command line arguments
 * @param args the arguments to parse
 * @param opts the options for the parser
 * @returns the parsed arguments
 *
 * @example
 * const args = parseArgs(args, {
 *  alias: { h: "help" },
 *  boolean: ["help"],
 *  string: ["port"],
 *  default: { port: 3000 },
 * });
 */
export function parseArgs(args: string[], opts: ArgOpts = {}): Args {
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
    if (value === undefined) {
      const nextArg = args[i + 1];
      if (
        nextArg !== undefined &&
        !nextArg.startsWith("-") &&
        !boolean.includes(key)
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
