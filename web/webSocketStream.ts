/**
 * Utility functions for wrapping standard WebSockets into standard web streams.
 */

export interface WebSocketConnection<
  T extends Uint8Array | string = Uint8Array | string,
> {
  readable: ReadableStream<T>;
  writable: WritableStream<T>;
  protocol: string;
  extensions: string;
}

export interface WebSocketCloseInfo {
  closeCode?: number;
  reason?: string;
}

export interface WebSocketStreamOptions {
  protocols?: string[];
  signal?: AbortSignal;
}

/**
 * [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) with [Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API)
 *
 * @see https://web.dev/websocketstream/
 */
export class WebSocketStream<
  T extends Uint8Array | string = Uint8Array | string,
> {
  readonly opened: Promise<WebSocketConnection<T>>;

  readonly closed: Promise<WebSocketCloseInfo>;

  readonly close: (closeInfo?: WebSocketCloseInfo) => void;

  constructor(ws: WebSocket, options: WebSocketStreamOptions = {}) {
    if (options.signal?.aborted) {
      throw new DOMException("This operation was aborted", "AbortError");
    }
    const closeWithInfo = (
      { closeCode: code, reason }: WebSocketCloseInfo = {},
    ) => ws.close(code, reason);

    this.opened = new Promise((resolve, reject) => {
      ws.onopen = () => {
        resolve({
          readable: new ReadableStream<T>({
            start(controller) {
              ws.onmessage = ({ data }) => {
                if (data instanceof ArrayBuffer) {
                  controller.enqueue(new Uint8Array(data) as T);
                } else {
                  controller.enqueue(data as T);
                }
              };
              ws.onerror = (e) => controller.error(e);
            },
            cancel: closeWithInfo,
          }),
          writable: new WritableStream<T>({
            write(chunk) {
              if (chunk instanceof Uint8Array) {
                ws.send(chunk.buffer as ArrayBuffer);
              } else {
                ws.send(chunk);
              }
            },
            abort() {
              ws.close();
            },
            close: closeWithInfo,
          }),
          protocol: ws.protocol,
          extensions: ws.extensions,
        });
        ws.removeEventListener("error", reject);
      };
      ws.addEventListener("error", reject);
    });

    this.closed = new Promise<WebSocketCloseInfo>((resolve, reject) => {
      ws.onclose = ({ code, reason }) => {
        resolve({ closeCode: code, reason });
        ws.removeEventListener("error", reject);
      };
      ws.addEventListener("error", reject);
    });

    if (options.signal) {
      options.signal.onabort = () => ws.close();
    }

    this.close = closeWithInfo;
  }
}
