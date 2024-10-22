import { Timer } from "./timer.ts";
import assert from "node:assert/strict";
import { test } from "node:test";


function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("timer should ring", async () => {
  const wait = 50;
  const start = Date.now();
  let end = Date.now();
  const _timer = new Timer(() => {
    end = Date.now();
  }, wait);
  await delay(wait);
  const timeDiff = end - start - wait;
  assert.deepStrictEqual(timeDiff < 10, true);
});

test("snooze should work", async () => {
  const wait = 50;
  const quarterWait = Math.floor(wait / 4);
  const halfWait = quarterWait * 2;
  const start = Date.now();
  let end = 0;
  const timer = new Timer(() => {
    end = Date.now();
  }, wait);
  await delay(halfWait);
  assert.deepStrictEqual(end, 0);
  timer.reset();
  await delay(halfWait + quarterWait);
  assert.deepStrictEqual(end, 0);
  await delay(wait + halfWait);
  const timeDiff = end - start - (wait + halfWait);
  assert.deepStrictEqual(timeDiff < 15, true, `TimeDiff of ${timeDiff} < 15`);
});

test("clear should work", () => {
  const wait = 50;
  let end = 0;
  const timer = new Timer(() => {
    end = Date.now();
  }, wait);
  timer.clear();
  assert.deepStrictEqual(end, 0);
});
