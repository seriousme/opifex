/**
 * The available log levels
 */
export const LogLevel = {
  error: 0,
  warn: 1,
  info: 2,
  verbose: 3,
  debug: 4,
} as const;

export type TLogLevel = typeof LogLevel[keyof typeof LogLevel];

/**
 * Simple logger class
 * @example
 * ```ts
 * const logger = new Logger();
 * logger.level(LogLevel.debug);
 * logger.debug("debug message");
 * logger.verbose("verbose message");
 * logger.info("info message");
 * logger.warn("warn message");
 * logger.error("error message");
 * ```
 */
export class Logger {
  private defaultError = console.error;
  private defaultWarn = console.warn;
  private defaultInfo = console.info;
  private defaultVerbose = console.log;
  private defaultDebug = console.log;
  // deno-lint-ignore no-explicit-any
  private noop = (..._data: any[]) => {};
  error = this.defaultError;
  warn = this.defaultWarn;
  info = this.defaultInfo;
  verbose = this.noop;
  debug = this.noop;

  constructor() {}

  level(logLevel: TLogLevel) {
    this.warn = logLevel > 0 ? this.defaultWarn : this.noop;
    this.info = logLevel > 1 ? this.defaultInfo : this.noop;
    this.verbose = logLevel > 2 ? this.defaultVerbose : this.noop;
    this.debug = logLevel > 3 ? this.defaultDebug : this.noop;
  }
}

/**
 * logger provides a singleton logger instance
 * @example
 * ```ts
 * import { logger } from "./utils/logger.ts";
 * logger.level(LogLevel.debug);
 * logger.debug("debug message");
 * logger.verbose("verbose message");
 * logger.info("info message");
 * logger.warn("warn message");
 * logger.error("error message");
 * ```
 */
export const logger: Logger = new Logger();
