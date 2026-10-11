export interface WebStreamEndpoint {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close: () => void;
}
