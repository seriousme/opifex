export class AssertionError extends Error {
    /** Constructs a new instance. */
    constructor(message) {
        super(message);
        this.name = "AssertionError";
    }
}
export function assert(expr, msg = "") {
    if (!expr) {
        throw new AssertionError(msg);
    }
}
export function assertArrayIncludes(actual, expected, msg) {
    const actualArr = Array.from(actual);
    const expectedArr = Array.from(expected);
    for (const item of expectedArr) {
        assert(actualArr.includes(item), msg + `\nExpected: ${expectedArr}\nActual: ${actualArr}`);
    }
}
