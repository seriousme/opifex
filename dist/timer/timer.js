export class Timer {
    delay; // delay in microseconds
    // deno-lint-ignore ban-types
    action; // function to perform when timer expires
    timer;
    end = 0;
    running = false;
    // deno-lint-ignore ban-types
    constructor(action, delay, wait = false) {
        this.delay = delay;
        this.action = action;
        if (!wait) {
            this.reset();
        }
    }
    startTimer(delay) {
        this.running = true;
        this.timer = setTimeout(() => this.ring(), delay);
    }
    ring() {
        const timeLeft = this.end - Date.now();
        // check if delay has passed, else execute action
        if (timeLeft > 0) {
            this.startTimer(timeLeft);
            return;
        }
        this.running = false;
        this.action();
    }
    reset() {
        this.end = Date.now() + this.delay;
        if (!this.running) {
            this.startTimer(this.delay);
        }
    }
    clear() {
        clearTimeout(this.timer);
        this.running = false;
    }
}
