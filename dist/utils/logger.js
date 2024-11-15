export const LogLevel = {
    error: 0,
    warn: 1,
    info: 2,
    verbose: 3,
    debug: 4,
};
export class Logger {
    defaultError = console.error;
    defaultWarn = console.warn;
    defaultInfo = console.info;
    defaultVerbose = console.log;
    defaultDebug = console.log;
    // deno-lint-ignore no-explicit-any
    noop = (..._data) => { };
    error = this.defaultError;
    warn = this.defaultWarn;
    info = this.defaultInfo;
    verbose = this.noop;
    debug = this.noop;
    constructor() { }
    level(logLevel) {
        this.warn = logLevel > 0 ? this.defaultWarn : this.noop;
        this.info = logLevel > 1 ? this.defaultInfo : this.noop;
        this.verbose = logLevel > 2 ? this.defaultVerbose : this.noop;
        this.debug = logLevel > 3 ? this.defaultDebug : this.noop;
    }
}
export const logger = new Logger();
