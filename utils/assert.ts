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

/** An array-like object (`Array`, `Uint8Array`, `NodeList`, etc.) that is not a string */
export type ArrayLikeArg<T> = ArrayLike<T> & object;

export function assertArrayIncludes<T>(
  actual: ArrayLikeArg<T>,
  expected: ArrayLikeArg<T>,
  msg?: string,
) {
  const actualArr = Array.from(actual);
  const expectedArr = Array.from(expected);
  for (const item of expectedArr) {
    assert(
      actualArr.includes(item),
      msg + `\nExpected: ${expectedArr}\nActual: ${actualArr}`,
    );
  }
}
