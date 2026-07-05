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

  /** Create a new Logger instance. */
  constructor() {}

  /**
   * Adjusts the current verbosity threshold, enabling or masking specific log outputs.
   * @param {TLogLevel} logLevel - The minimum numeric severity level threshold to output.
   */
  level(logLevel: TLogLevel) {
    this.warn = logLevel > 0 ? this.defaultWarn : noop;
    this.info = logLevel > 1 ? this.defaultInfo : noop;
    this.verbose = logLevel > 2 ? this.defaultVerbose : noop;
    this.debug = logLevel > 3 ? this.defaultDebug : noop;
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
