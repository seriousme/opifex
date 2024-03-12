import { SockConn } from "../socket/socket.ts";

export function socket2conn(socket) {
  socket.data = {};
  const readStream = new ReadableStream({
    type: "bytes",
    start(controller) {
      socket.data.controller = controller;
    },
  });
  const reader = readStream.getReader({ mode: "byob" });

  const conn: SockConn = {
    readable: readStream,
    async read(buff: Uint8Array) {
      const buff2 = new Uint8Array(buff.length);
      const result = await reader.read(buff2);
      if (!result.done) {
        buff.set(result.value);
      }
      return result.value?.byteLength || null;
    },
    close() {
      socket.shutdown();
    },
    write(data: Uint8Array): Promise<number> {
      socket.write(data);
      return new Promise((resolve) => resolve(data.length));
    },
  };
  socket.data.conn = conn;
  return conn;
}
