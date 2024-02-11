import { Timer } from "./timer.ts";
import { assertEquals } from "../utils/dev_deps.ts";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.test("timer should ring", async () => {
  const wait = 50;
  const start = Date.now();
  let end = Date.now();
  const _timer = new Timer(() => {
    end = Date.now();
  }, wait);
  await delay(wait);
  const timeDiff = end - start - wait;
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
  const timeDiff = end - start - (wait + halfWait);
  assertEquals(timeDiff < 15, true, `TimeDiff of ${timeDiff} < 15`);
});

Deno.test("clear should work", () => {
  const wait = 50;
  let end = 0;
  const timer = new Timer(() => {
    end = Date.now();
  }, wait);
  timer.clear();
  assertEquals(end, 0);
});
