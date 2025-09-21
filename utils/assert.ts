export class AssertionError extends Error {
  /** Constructs a new instance. */
  constructor(message: string) {
    super(message);
    this.name = "AssertionError";
  }
}

/** assert(expr, msg) throws AssertionError if expr is falsy. */
export function assert(expr: unknown, msg = ""): asserts expr {
  if (!expr) {
    throw new AssertionError(msg);
  }
}
