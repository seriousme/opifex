export class Timer {
  readonly delay: number; // delay in microseconds
  // deno-lint-ignore ban-types
  private action: Function; // function to perform when timer expires
  private timer?: ReturnType<typeof setTimeout>;
  private end = 0;
  private running = false;

  // deno-lint-ignore ban-types
  constructor(action: Function, delay: number, wait = false) {
    this.delay = delay;
    this.action = action;
    if (!wait) {
      this.reset();
    }
  }

  private startTimer(delay: number): void {
    this.running = true;
    this.timer = setTimeout(() => this.ring(), delay);
  }

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

  reset(): void {
    this.end = Date.now() + this.delay;
    if (!this.running) {
      this.startTimer(this.delay);
    }
  }

  clear(): void {
    clearTimeout(this.timer);
    this.running = false;
  }
}
