import type { Socket } from "node:net";
import type { ConnAddr, ConnNext } from "../connNext/connNext.ts";
import { BaseConnNext } from "../connNext/baseConnNext.ts";

export class NodeSocketConnNext extends BaseConnNext {
  private socket: Socket;

  constructor(socket: Socket) {
    super();
    this.socket = socket;

    const markClosed = () => {
      this.closed = true;
    };

    this.socket.on("end", markClosed);
    this.socket.on("close", markClosed);
    this.socket.on("error", markClosed);
  }

  get localAddr(): ConnAddr | undefined {
    return this.socket.localAddress
      ? {
        transport: "tcp",
        hostname: this.socket.localAddress,
        port: this.socket.localPort ?? 0,
      }
      : undefined;
  }

  get remoteAddr(): ConnAddr | undefined {
    return this.socket.remoteAddress
      ? {
        transport: "tcp",
        hostname: this.socket.remoteAddress,
        port: this.socket.remotePort ?? 0,
      }
      : undefined;
  }

  /**
   * Haalt direct op verzoek een chunk op via Node's ingebouwde socket.read() mechanisme.
   */
  protected pullNextChunk(): Promise<Uint8Array | null> {
    if (this.closed || !this.socket.readable) {
      return Promise.resolve(null);
    }

    // Vraag direct om data uit de Node socket buffer
    const chunk = this.socket.read();

    if (chunk !== null) {
      return Promise.resolve(
        new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength),
      );
    }

    // Als er nog geen data is ('null'), wachten we op het 'readable' (of 'end'/'close') event van Node
    return new Promise<Uint8Array | null>((resolve) => {
      const cleanup = () => {
        this.socket.off("readable", onReadable);
        this.socket.off("end", onEnd);
        this.socket.off("error", onClose);
        this.socket.off("close", onClose);
      };

      const onReadable = () => {
        cleanup();
        // Roep zichzelf direct weer aan om de data op te halen
        resolve(this.pullNextChunk());
      };

      const onEnd = () => {
        cleanup();
        this.closed = true;
        resolve(null);
      };

      const onClose = () => {
        cleanup();
        this.closed = true;
        resolve(null);
      };

      this.socket.on("readable", onReadable);
      this.socket.on("end", onEnd);
      this.socket.on("error", onClose);
      this.socket.on("close", onClose);
    });
  }

  write(data: Uint8Array): Promise<void> {
    if (this.isClosed() || !this.socket.writable) {
      return Promise.reject(new Error("Socket is closed or not writable"));
    }

    return new Promise((resolve, reject) => {
      const canWriteMore = this.socket.write(data, (err) => {
        if (err) reject(err);
      });

      if (canWriteMore) {
        resolve();
      } else {
        this.socket.once("drain", resolve);
      }
    });
  }

  close(): void {
    if (!this.closed) {
      this.closed = true;
      try {
        this.socket.destroy();
      } catch {
        /* swallow */
      }
    }
  }
}

export function nodeSocketToNext(socket: Socket): ConnNext {
  return new NodeSocketConnNext(socket);
}
