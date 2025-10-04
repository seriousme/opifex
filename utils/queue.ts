/**
 * A simple queue implementation using an array.
 * This implementation optimizes for O(1) enqueue and dequeue operations
 * by avoiding array shifts, which are O(n).
 *
 * Usage:
 * ```ts
 * const queue = new ArrayQueue<number>();
 * queue.enqueue(1);
 * queue.enqueue(2);
 * console.log(queue.dequeue()); // 1
 * console.log(queue.size()); // 1
 * console.log(queue.isEmpty()); // false
 * queue.dequeue();
 * console.log(queue.isEmpty()); // true
 * ```
 */

export class ArrayQueue<T> {
  private items: T[] = [];
  private headIndex: number = 0; // Tracks the front of the queue

  /**
   * size is the difference between the actual array length and the index offset
   * @returns the number of items in the queue
   */
  public size(): number {
    return this.items.length - this.headIndex;
  }
  /**
   * isEmpty checks if the queue has no items
   * @returns true if the queue is empty
   */
  public isEmpty(): boolean {
    return this.size() === 0;
  }
  /**
   * enqueue adds an item to the end of the queue
   *  O(1) - Push to the end is highly optimized in V8.
   */
  public enqueue(data: T): void {
    this.items.push(data);
  }
  /**
   * dequeue removes and returns the item at the front of the queue
   * O(1) - Avoids array shifting by incrementing the index.
   * @returns the item at the front of the queue or undefined if the queue is empty
   */
  public dequeue(): T | undefined {
    if (this.isEmpty()) {
      return undefined;
    }

    const item = this.items[this.headIndex];
    this.headIndex++; // Move the "front" marker forward

    // Optimization: Periodically "clean up" the dead space
    // when the empty space (headIndex) exceeds a threshold.
    // This amortizes the cost, keeping average time closer to O(1).
    if (this.headIndex > 2000 && this.headIndex > this.items.length / 4) {
      this.items = this.items.slice(this.headIndex);
      this.headIndex = 0;
    }
    return item;
  }
}
