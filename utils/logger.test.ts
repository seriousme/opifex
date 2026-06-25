import { mock, test } from "node:test";
import assert from "node:assert";
import { Logger, logger, LogLevel } from "./logger.ts";

// Helper to check if a function is the 'noop' function
// deno-lint-ignore ban-types
const isNoop = (fn: Function) =>
  fn.name === "noop" || fn.toString().includes("noop");

test("default initialization", () => {
  const testLogger = new Logger();

  // By default, error, warn, and info should be active, while verbose/debug should be noop
  assert.strictEqual(typeof testLogger.error, "function");
  assert.strictEqual(typeof testLogger.warn, "function");
  assert.strictEqual(typeof testLogger.info, "function");

  assert.strictEqual(
    isNoop(testLogger.verbose),
    true,
    "Verbose should be noop by default",
  );
  assert.strictEqual(
    isNoop(testLogger.debug),
    true,
    "Debug should be noop by default",
  );
});

test("level(LogLevel.error) activates only error", () => {
  const testLogger = new Logger();
  testLogger.level(LogLevel.error);

  assert.strictEqual(
    isNoop(testLogger.warn),
    true,
    "Warn should be noop at error level",
  );
  assert.strictEqual(
    isNoop(testLogger.info),
    true,
    "Info should be noop at error level",
  );
  assert.strictEqual(
    isNoop(testLogger.verbose),
    true,
    "Verbose should be noop at error level",
  );
  assert.strictEqual(
    isNoop(testLogger.debug),
    true,
    "Debug should be noop at error level",
  );
});

test("level(LogLevel.info) activates warn and info", () => {
  const testLogger = new Logger();
  testLogger.level(LogLevel.info);

  assert.strictEqual(
    isNoop(testLogger.warn),
    false,
    "Warn should be active at info level",
  );
  assert.strictEqual(
    isNoop(testLogger.info),
    false,
    "Info should be active at info level",
  );
  assert.strictEqual(
    isNoop(testLogger.verbose),
    true,
    "Verbose should be noop at info level",
  );
  assert.strictEqual(
    isNoop(testLogger.debug),
    true,
    "Debug should be noop at info level",
  );
});

test("level(LogLevel.debug) activates all loggers", () => {
  const testLogger = new Logger();
  testLogger.level(LogLevel.debug);

  assert.strictEqual(isNoop(testLogger.warn), false);
  assert.strictEqual(isNoop(testLogger.info), false);
  assert.strictEqual(isNoop(testLogger.verbose), false);
  assert.strictEqual(isNoop(testLogger.debug), false);
});

test("verify that log functions actually execute logging", () => {
  const testLogger = new Logger();

  // deno-lint-ignore no-explicit-any
  const debugSpy = mock.method(testLogger as any, "defaultDebug");
  // set the level, this will connect the spy
  testLogger.level(LogLevel.debug);

  testLogger.debug("Test debug message");

  // check if the spy was called
  assert.strictEqual(
    debugSpy.mock.calls.length,
    1,
    "The log method should be called exactly once",
  );

  // and if the parameters were passed correcty
  assert.deepStrictEqual(debugSpy.mock.calls[0].arguments, [
    "Test debug message",
  ]);

  // cleaunup the mock and restore state to normal
  mock.restoreAll();
});

test("verify that the exported logger is an instance", () => {
  assert.strictEqual(
    logger instanceof Logger,
    true,
    "The exported logger must be a Logger instance",
  );
});

test("should always return the exact same instance (Reference Check)", () => {
  const firstImport = logger;
  const secondImport = logger;

  // Verify both references point to the exact same object in memory
  assert.strictEqual(
    firstImport,
    secondImport,
    "The exported logger must be a strict singleton reference",
  );
});

test("should share state across the application (State Check)", () => {
  // 1. Change the log level to Error
  logger.level(LogLevel.error);

  // 2. Verify the state change is reflected globally (debug should now be noop)
  assert.strictEqual(
    isNoop(logger.debug),
    true,
    "State changes should reflect globally",
  );

  // 3. Change it back to Debug and verify again
  logger.level(LogLevel.debug);
  assert.strictEqual(
    isNoop(logger.debug),
    false,
    "State changes should reflect globally",
  );
});

test("should not be the same as a newly instantiated Logger", () => {
  const newInstance = new Logger();

  // The singleton instance must be completely unique from manually created instances
  assert.notStrictEqual(
    logger,
    newInstance,
    "The singleton instance must be unique from new Logger() instances",
  );
});
