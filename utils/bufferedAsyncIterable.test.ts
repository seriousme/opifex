import { test } from "node:test";
import assert from "node:assert";
import { BufferedAsyncIterable } from "./bufferedAsyncIterable.ts";

test("should initialize with correct default state", () => {
  const iterable = new BufferedAsyncIterable<number>();
  assert.strictEqual(iterable.isDone, false);
});

test("should handle immediate push and pull via next()", () => {
  const iterable = new BufferedAsyncIterable<string>();

  iterable.push("hello");
  const result = iterable.next();

  assert.strictEqual(result, "hello");
});

test("should resolve a pending next() call when data is pushed later", async () => {
  const iterable = new BufferedAsyncIterable<number>();

  const pendingPromise = iterable.next() as Promise<number>;

  // The promise should resolve once we push data
  iterable.push(42);

  const result = await pendingPromise;
  assert.strictEqual(result, 42);
});

test("should work correctly with for-await-of loop", async () => {
  const iterable = new BufferedAsyncIterable<number>();
  const items: number[] = [];

  iterable.push(1);
  iterable.push(2);

  // Read items asynchronously
  const consumer = async () => {
    try {
      for await (const item of iterable) {
        items.push(item);
      }
    } catch (err) {
      // Expecting a 'Closed' error to break the loop when close() is called
      assert.match((err as Error).message, /closed/i);
    }
  };

  const consumerPromise = consumer();

  // Allow the event loop to process the items, then close the iterable
  await new Promise((resolve) => setTimeout(resolve, 10));
  iterable.close();

  await consumerPromise;

  assert.deepStrictEqual(items, [1, 2]);
});

test("should reject pending promises and throw when closed", async () => {
  const iterable = new BufferedAsyncIterable<number>();

  const pendingPromise = iterable.next() as Promise<number>;

  iterable.close("custom close reason");

  // The outstanding promise should now reject
  await assert.rejects(pendingPromise, /custom close reason/);

  // Subsequent calls to next() should instantly throw
  assert.throws(() => iterable.next(), /Closed/);
});

test("should apply backpressure when buffer size is exceeded", async () => {
  // Set a very small buffer size of 1 to easily trigger backpressure
  const iterable = new BufferedAsyncIterable<number>(1);

  // First item fills the queue size to 1 (equal to bufferSize, no backpressure yet)
  iterable.push(1);

  // Second item exceeds bufferSize (size becomes 2), returning a backpressure promise
  const backpressurePromise = iterable.push(2);

  assert.ok(
    backpressurePromise instanceof Promise,
    "Should return a promise due to backpressure",
  );

  // Wait for the backpressure timeout to resolve (proportional to buffer size, 2ms)
  await backpressurePromise;
});
