export class Conn {
    reader;
    writer;
    closed;
    remoteAddr;
    closer;
    constructor(sockConn) {
        this.closed = false;
        this.reader = sockConn.readable.getReader({ mode: "byob" });
        this.writer = sockConn.writable.getWriter();
        // this.writer.closed.then(() => this.closed = true);
        this.closer = sockConn.close.bind(sockConn);
        this.remoteAddr = sockConn.remoteAddr;
    }
    async read(buff) {
        const buff2 = new Uint8Array(buff.length);
        const result = await this.reader.read(buff2);
        if (!result.done) {
            buff.set(result.value);
        }
        return result.value?.byteLength || null;
    }
    write(data) {
        if (this.closed) {
            return Promise.reject();
        }
        this.writer.write(data);
        return new Promise((resolve) => resolve(data.length));
    }
    close() {
        if (!this.closed) {
            this.closed = true;
            this.closer();
        }
    }
}
