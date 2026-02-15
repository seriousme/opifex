// web-socketpair.ts

export interface WebSocketEndpoint {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close: () => void;
}

/**
 * Create two interconnected endpoints.
 * Writing to input.writable is readable from output.readable and vice versa.
 */
export function createWebSocketPair(): {
  input: WebSocketEndpoint;
  output: WebSocketEndpoint;
} {
  // Controllers are captured in start() so we can enqueue from the opposite side.
  let aController: ReadableByteStreamController;
  let bController: ReadableByteStreamController;

  const endpointAReadable = new ReadableStream<Uint8Array>({
    type: "bytes",
    start(controller) {
      aController = controller as ReadableByteStreamController;
    },
  });

  const endpointBReadable = new ReadableStream<Uint8Array>({
    type: "bytes",
    start(controller) {
      bController = controller as ReadableByteStreamController;
    },
  });

  const endpointAWritable = new WritableStream<Uint8Array>({
    write(chunk) {
      // Data written by A becomes readable by B
      if (chunk.byteLength > 0) {
        bController.enqueue(chunk);
      }
    },
    close() {
      bController.close();
    },
    abort(reason) {
      bController.error(reason);
    },
  });

  const endpointBWritable = new WritableStream<Uint8Array>({
    write(chunk) {
      // Data written by B becomes readable by A
      if (chunk.byteLength > 0) {
        aController.enqueue(chunk);
      }
    },
    close() {
      aController.close();
    },
    abort(reason) {
      aController.error(reason);
    },
  });

  return {
    input: {
      readable: endpointAReadable,
      writable: endpointAWritable,
      close: () => {
        if (!endpointAWritable.locked) {
          endpointAWritable.abort();
        }
      },
    },
    output: {
      readable: endpointBReadable,
      writable: endpointBWritable,
      close: () => {
        if (!endpointBWritable.locked) {
          endpointBWritable.abort();
        }
      },
    },
  };
}
