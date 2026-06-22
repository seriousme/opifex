import { test } from "node:test";
import assert from "node:assert";
import { ArrayQueue } from "./queue.ts";

test("should initialize as an empty queue", () => {
  const queue = new ArrayQueue<number>();
  assert.strictEqual(queue.isEmpty(), true);
  assert.strictEqual(queue.size(), 0);
});

test("should enqueue elements and update size correctly", () => {
  const queue = new ArrayQueue<string>();

  queue.enqueue("A");
  assert.strictEqual(queue.isEmpty(), false);
  assert.strictEqual(queue.size(), 1);

  queue.enqueue("B");
  assert.strictEqual(queue.size(), 2);
});

test("should dequeue elements in First-In, First-Out (FIFO) order", () => {
  const queue = new ArrayQueue<number>();
  queue.enqueue(10);
  queue.enqueue(20);
  queue.enqueue(30);

  assert.strictEqual(queue.dequeue(), 10);
  assert.strictEqual(queue.size(), 2);

  assert.strictEqual(queue.dequeue(), 20);
  assert.strictEqual(queue.size(), 1);

  assert.strictEqual(queue.dequeue(), 30);
  assert.strictEqual(queue.isEmpty(), true);
});

test("should return undefined when dequeuing an empty queue", () => {
  const queue = new ArrayQueue<unknown>();
  assert.strictEqual(queue.dequeue(), undefined);
});

test("should trigger internal cleanup (slice optimization) correctly", () => {
  const queue = new ArrayQueue<number>();

  // 1. Fill the queue with enough elements to exceed the threshold of 2000
  const testSize = 2500;
  for (let i = 0; i < testSize; i++) {
    queue.enqueue(i);
  }

  // 2. Dequeue more than 1/4 of the total length to trigger the optimization (> 625 times)
  // Dequeuing 2100 times satisfies the condition: headIndex > 2000 && headIndex > items.length / 4
  for (let i = 0; i < 2100; i++) {
    assert.strictEqual(queue.dequeue(), i);
  }

  // 3. Verify that the queue still functions correctly after internal cleanup
  assert.strictEqual(queue.size(), testSize - 2100); // 400 remaining
  assert.strictEqual(queue.dequeue(), 2100); // Next in line
});
