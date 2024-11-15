import { Writable } from "node:stream";
function closer(sock) {
    if (!sock.closed) {
        sock.end();
    }
}
export function wrapNodeSocket(socket) {
    const readable = new ReadableStream({
        type: "bytes",
        start(controller) {
            socket.on("data", (data) => {
                controller.enqueue(data);
                const desiredSize = controller.desiredSize ?? 0;
                if (desiredSize <= 0) {
                    // The internal queue is full, so propagate
                    // the backpressure signal to the underlying source.
                    socket.pause();
                }
            });
            socket.on("error", (err) => controller.error(err));
            socket.on("end", () => {
                // close the controller
                controller.close();
                // and unlock the last BYOB read request
                controller.byobRequest?.respond(0);
            });
        },
        pull: () => {
            socket.resume();
        },
        cancel: () => {
            socket.end();
        },
    });
    const writable = Writable.toWeb(socket);
    const remoteAddr = {
        hostname: socket.remoteAddress || "",
        port: socket.remotePort || 0,
    };
    const conn = {
        readable: readable,
        writable: writable,
        close: () => closer(socket),
        remoteAddr,
    };
    return conn;
}
