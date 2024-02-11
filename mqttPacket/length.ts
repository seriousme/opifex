export function encodeLength(x: number): number[] {
  const output = [];
  do {
    let encodedByte = x % 0x80;
    x = Math.floor(x / 0x80);
    if (x > 0) {
      encodedByte = encodedByte | 0x80;
    }
    output.push(encodedByte);
  } while (x > 0);
  if (output.length > 4) {
    throw Error("length encoding failed");
  }
  return output;
}

export function decodeLength(
  buf: Uint8Array,
  start: number,
): { length: number; numLengthBytes: number } {
  const decode = getLengthDecoder();
  const lenBuf = buf.subarray(start);
  for (const byte of lenBuf) {
    const { done, length, numLengthBytes } = decode(byte);
    if (done) {
      return { length, numLengthBytes };
    }
  }
  throw Error("length decoding failed");
}

export function getLengthDecoder(): (encodedByte: number) => {
  done: boolean;
  length: number;
  numLengthBytes: number;
} {
  let numLengthBytes = 1;
  let length = 0;
  let multiplier = 1;

  return function addLengthByte(encodedByte: number) {
    length += (encodedByte & 0x7f) * multiplier;
    multiplier *= 0x80;
    if ((encodedByte & 0x80) === 0) {
      return { done: true, length, numLengthBytes };
    }
    if (numLengthBytes++ >= 4) {
      throw Error("length decoding failed");
    }
    return { done: false, length, numLengthBytes };
  };
}
