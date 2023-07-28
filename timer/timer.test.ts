import { Timer } from "./timer.ts";
import { assertEquals } from "https://deno.land/std@0.196.0/testing/asserts.ts";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.test("timer should ring", async () => {
  const wait = 50;
  const start = Date.now();
  let end = Date.now();
  const timer = new Timer(() => {
    end = Date.now();
  }, wait);
  await delay(wait);
  const timeDiff = (end - start) - wait;
  console.log(timeDiff);
  assertEquals(timeDiff < 10, true);
});

Deno.test("snooze should work", async () => {
  const wait = 50;
  const quarterWait = Math.floor(wait / 4);
  const halfWait = quarterWait * 2;
  const start = Date.now();
  let end = 0;
  const timer = new Timer(() => {
    end = Date.now();
  }, wait);
  await delay(halfWait);
  assertEquals(end, 0);
  timer.reset();
  await delay(halfWait + quarterWait);
  assertEquals(end, 0);
  await delay(wait + halfWait);
  const timeDiff = (end - start) - (wait + halfWait);
  assertEquals(timeDiff < 15, true, `TimeDiff of ${timeDiff} < 15`);
});

Deno.test("clear should work", async () => {
  const wait = 50;
  const quarterWait = Math.floor(wait / 4);
  const halfWait = quarterWait * 2;
  const start = Date.now();
  let end = 0;
  const timer = new Timer(() => {
    end = Date.now();
  }, wait);
  timer.clear();
  assertEquals(end, 0);
});
