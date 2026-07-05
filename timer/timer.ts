/**
 * A reusable timer class that executes a callback function after a specified delay.
 * It handles potential drifts or early triggers by checking the actual remaining time
 * before executing the action.
 */
export class Timer {
  /** The delay duration in milliseconds before the timer expires. */
  readonly delay: number; // delay in microseconds

  // deno-lint-ignore ban-types
  /** The callback function to perform when the timer expires. */
  private action: Function; // function to perform when timer expires

  /** The internal timeout identifier reference, if a timer is active. */
  private timer?: ReturnType<typeof setTimeout>;

  /** The timestamp (in milliseconds) indicating when the timer is scheduled to end. */
  private end = 0;

  /** Indicates whether the timer is currently active and running. */
  private running = false;

  // deno-lint-ignore ban-types
  /**
   * Initializes a new instance of the Timer.
   * @param {Function} action - The callback function to execute upon expiration.
   * @param {number} delay - The delay duration in milliseconds.
   * @param {boolean} [wait=false] - If true, the timer will not start automatically until reset() is called.
   */
  constructor(action: Function, delay: number, wait = false) {
    this.delay = delay;
    this.action = action;
    if (!wait) {
      this.reset();
    }
  }

  /**
   * Starts the internal setTimeout with the specified delay.
   * @param {number} delay - The duration in milliseconds for the timeout.
   */
  private startTimer(delay: number): void {
    this.running = true;
    this.timer = setTimeout(() => this.ring(), delay);
  }

  /**
   * Internal handler triggered when the timeout fires.
   * Verifies if the target end time has genuinely passed, rescheduling if necessary,
   * or executes the action.
   */
  private ring(): void {
    const timeLeft = this.end - Date.now();
    // check if delay has passed, else execute action
    if (timeLeft > 0) {
      this.startTimer(timeLeft);
      return;
    }
    this.running = false;
    this.action();
  }

  /**
   * Resets the timer, recalculating the end time and restarting the countdown.
   * If the timer is already running, it updates the target end time.
   */
  reset(): void {
    this.end = Date.now() + this.delay;
    if (!this.running) {
      this.startTimer(this.delay);
    }
  }

  /**
   * Cancels the active timeout and stops the timer from running.
   */
  clear(): void {
    clearTimeout(this.timer);
    this.running = false;
  }
}
