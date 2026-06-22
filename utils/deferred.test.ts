import { test } from "node:test";
import assert from "node:assert";
import { Deferred } from "./deferred.ts"; // Note the .js extension if you are using ESM

test("should initialize with a pending promise", async () => {
  const deferred = new Deferred<string>();

  assert.ok(deferred.promise instanceof Promise);

  // Verify it is indeed pending by racing it against a fast timeout
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Timeout")), 10)
  );
  await assert.rejects(Promise.race([deferred.promise, timeout]), /Timeout/);
});

test("should resolve the promise when resolve() is called", async () => {
  const deferred = new Deferred<number>();

  deferred.resolve(123);

  const result = await deferred.promise;
  assert.strictEqual(result, 123);
});

test("should reject the promise when reject() is called", async () => {
  const deferred = new Deferred<void>();
  const testError = new Error("Something went wrong");

  deferred.reject(testError);

  await assert.rejects(deferred.promise, (err: Error) => {
    assert.strictEqual(err.message, "Something went wrong");
    return true;
  });
});
