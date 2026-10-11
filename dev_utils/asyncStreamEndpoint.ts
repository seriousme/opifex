export interface AsyncStreamEndpoint {
  readable: AsyncIterable<Uint8Array>;
  write: (chunk: Uint8Array) => Promise<void>;
  close: () => void;
}
