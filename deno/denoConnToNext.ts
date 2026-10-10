import type { ConnAddr, ConnNext } from "../connNext/connNext.ts";

export function denoConnToNext(conn: Deno.Conn): ConnNext {
  // Convert Deno network addresses to custom ConnAddr format
  const formatAddr = (addr: Deno.Addr): ConnAddr => {
    if (addr.transport === "tcp" || addr.transport === "udp") {
      return {
        transport: addr.transport,
        hostname: addr.hostname,
        port: addr.port,
      };
    }
    const unixAddr = addr as Deno.UnixAddr;
    return {
      transport: "unix",
      path: unixAddr.path,
    };
  };

  // Utilize a BYOB (Bring Your Own Buffer) reader on Deno's readable stream
  // This enables exact sizing and zero-copy reads on the kernel buffer
  const reader = conn.readable.getReader({ mode: "byob" });
  const writer = conn.writable.getWriter();

  return {
    remoteAddr: formatAddr(conn.remoteAddr),
    localAddr: formatAddr(conn.localAddr),

    /**
     * Read exactly 'length' bytes directly into a Uint8Array buffer
     */
    async read(length?: number): Promise<Uint8Array | null> {
      try {
        // If no length is provided, read a default chunk size (e.g., 64KB)
        const bytesToRead = length ?? 65536;
        let buffer = new Uint8Array(bytesToRead);
        let bytesRead = 0;

        while (bytesRead < bytesToRead) {
          // Pass the unfilled section of the buffer to Deno's kernel reader
          const view = new Uint8Array(
            buffer.buffer,
            buffer.byteOffset + bytesRead,
            bytesToRead - bytesRead,
          );

          const { value, done } = await reader.read(view);

          if (done) {
            // Connection closed before all data could be read
            if (bytesRead === 0) return null;
            // Return any partial data read prior to closure
            return buffer.subarray(0, bytesRead);
          }

          // BYOB returns the populated ArrayBufferView
          buffer = new Uint8Array(value.buffer);
          bytesRead += value.byteLength;

          // If no explicit length was requested, return the first chunk immediately
          if (length === undefined) {
            return buffer.subarray(0, bytesRead);
          }
        }

        return buffer;
      } catch {
        return null;
      }
    },

    /**
     * Write via Deno's WritableStream with built-in backpressure handling
     */
    async write(data: Uint8Array): Promise<void> {
      // writer.write automatically pauses the promise when the TCP pipe is full
      await writer.write(data);
    },

    /**
     * Gracefully close reader, writer, and socket connection
     */
    close(): void {
      try {
        writer.releaseLock();
        reader.releaseLock();
        conn.close();
      } catch {
        /* swallow */
      }
    },

    /**
     * Async Iterator for Deno
     */
    async *[Symbol.asyncIterator]() {
      while (true) {
        const chunk = await this.read();
        if (chunk === null) break;
        yield chunk;
      }
    },
  };
}
