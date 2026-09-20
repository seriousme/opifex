import { noop } from "./utils.ts";

/**
 * The available log levels used to filter messages.
 */
export const LogLevel = {
  /** Crucial application errors or failures. */
  error: 0,
  /** Non-fatal warnings that indicate unexpected behavior. */
  warn: 1,
  /** Informational statements highlighting general operational flow. */
  info: 2,
  /** Detailed tracing and comprehensive runtime statements. */
  verbose: 3,
  /** High-density internal troubleshooting logs. */
  debug: 4,
} as const;

/**
 * Union type representing the permitted numeric log level indices.
 */
export type TLogLevel = typeof LogLevel[keyof typeof LogLevel];

type LogArgument = unknown | (() => unknown);

/**
 * Simple logger class providing level-configurable output routing.
 * @class Logger
 *
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
  /** Native console reference used to output critical errors. */
  private defaultError = console.error;
  /** Native console reference used to output warning flags. */
  private defaultWarn = console.warn;
  /** Native console reference used to output standard runtime indicators. */
  private defaultInfo = console.info;
  /** Native console reference used to track granular metrics and details. */
  private defaultVerbose = console.log;
  /** Native console reference used to step through highly specific operations. */
  private defaultDebug = console.log;

  /** Flag indicating if error messages should be logged. */
  isError = true;
  /** Flag indicating if warning messages should be logged. */
  isWarn = true;
  /** Flag indicating if informational messages should be logged. */
  isInfo = true;
  /** Flag indicating if verbose messages should be logged. */
  isVerbose = false;
  /** Flag indicating if debug messages should be logged. */
  isDebug = false;

  /** Log an error message to the standard error stream. */
  error: typeof console.log = this.defaultError;
  /** Log a warning message if the active log level permits. */
  warn: typeof console.log = this.defaultWarn;
  /** Log an informational status update if the active log level permits. */
  info: typeof console.log = this.defaultInfo;
  /** Log extended telemetry notes if the active log level permits. */
  verbose: typeof console.log = noop;
  /** Log debug parameters and objects if the active log level permits. */
  debug: typeof console.log = noop;

  /** Creates a wrapper function that evaluates lazy log arguments before invoking the target logging function. */
  // deno-lint-ignore no-explicit-any
  private createLogFn(targetFn: (...args: any[]) => void) {
    return (...args: LogArgument[]) => {
      const evaluated = args.map((
        arg,
      ) => (typeof arg === "function" ? arg() : arg));
      targetFn(...evaluated);
    };
  }

  /** Create a new Logger instance. */
  constructor() {}

  /**
   * Adjusts the current verbosity threshold, enabling or masking specific log outputs.
   * @param {TLogLevel} logLevel - The minimum numeric severity level threshold to output.
   */
  level(logLevel: TLogLevel) {
    this.isWarn = logLevel >= LogLevel.warn;
    this.isInfo = logLevel >= LogLevel.info;
    this.isVerbose = logLevel >= LogLevel.verbose;
    this.isDebug = logLevel >= LogLevel.debug;
    this.warn = this.isWarn ? this.createLogFn(this.defaultWarn) : noop;
    this.info = this.isInfo ? this.createLogFn(this.defaultInfo) : noop;
    this.verbose = this.isVerbose
      ? this.createLogFn(this.defaultVerbose)
      : noop;
    this.debug = this.isDebug ? this.createLogFn(this.defaultDebug) : noop;
  }
}

/**
 * Provides a single pre-configured global logger instance.
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
