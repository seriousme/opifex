import type { Socket } from "node:net";
import type { ConnAddr, ConnNext } from "../connNext/connNext.ts"; // Custom types

export function nodeSocketToNext(socket: Socket): ConnNext {
  // Convert addresses to custom ConnAddr format
  const remoteAddr: ConnAddr | undefined = socket.remoteAddress
    ? {
      transport: "tcp",
      hostname: socket.remoteAddress,
      port: socket.remotePort ?? 0,
    }
    : undefined;

  const localAddr: ConnAddr = socket.localAddress
    ? {
      transport: "tcp",
      hostname: socket.localAddress,
      port: socket.localPort ?? 0,
    }
    : undefined;

  return {
    remoteAddr,
    localAddr,

    /**
     * Read exactly 'length' bytes from the Node.js socket buffer.
     */
    read(length?: number): Promise<Uint8Array | null> {
      if (socket.destroyed || !socket.readable) return Promise.resolve(null);

      // If no specific byte length is requested, read whatever is available
      if (length === undefined) {
        const chunk = socket.read();
        return chunk
          ? Promise.resolve(
            new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength),
          )
          : Promise.resolve(null);
      }

      // Attempt to retrieve the requested byte amount synchronously from the internal buffer
      let chunk = socket.read(length);
      if (chunk) {
        return Promise.resolve(
          new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength),
        );
      }

      // If the buffer does not contain enough data yet, wait for 'readable' / 'end' events
      return new Promise<Uint8Array | null>((resolve, reject) => {
        const onReadable = () => {
          chunk = socket.read(length);
          if (chunk) {
            cleanup();
            resolve(
              new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength),
            );
          }
        };

        const onEnd = () => {
          cleanup();
          resolve(null);
        };

        const onError = (err: Error) => {
          cleanup();
          reject(err);
        };

        const cleanup = () => {
          socket.removeListener("readable", onReadable);
          socket.removeListener("end", onEnd);
          socket.removeListener("error", onError);
        };

        socket.on("readable", onReadable);
        socket.once("end", onEnd);
        socket.once("error", onError);
      });
    },

    /**
     * Write data with native Promise-based backpressure handling
     */
    write(data: Uint8Array): Promise<void> {
      return new Promise((resolve, reject) => {
        if (socket.destroyed || !socket.writable) {
          return reject(new Error("Socket is closed"));
        }

        // socket.write returns false if the internal kernel buffer is full
        const needsDrain = !socket.write(data, (err) => {
          if (err) reject(err);
        });

        if (!needsDrain) {
          // No backpressure, resolve immediately
          resolve();
        } else {
          // Wait for the 'drain' event to handle backpressure pause
          socket.once("drain", resolve);
          socket.once("error", reject);
        }
      });
    },

    /**
     * Gracefully close the socket connection
     */
    close(): void {
      if (!socket.destroyed) {
        socket.end(); // Send FIN packet
        socket.destroy(); // Free memory immediately
      }
    },

    /**
     * Enables async iteration (for await (const chunk of socket))
     */
    async *[Symbol.asyncIterator]() {
      for await (const chunk of socket) {
        yield new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      }
    },
  };
}
