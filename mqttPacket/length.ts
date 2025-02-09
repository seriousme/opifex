/**
 * Encodes a number into a variable-length byte array using a modified base-128 encoding
 * @param n The number to encode
 * @returns Array of bytes representing the encoded number
 * @throws Error if the encoded length is greater than 4 bytes
 */
export function encodeLength(n: number): number[] {
  const output = [];
  let x = n;
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

/**
 * Decodes a variable-length encoded number from a byte array
 * @param buf The byte array containing the encoded number
 * @param start The starting position in the buffer to begin decoding
 * @returns Object containing the decoded length and number of bytes used for encoding
 * @throws Error if decoding fails
 */
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

/**
 * Interface for the result returned by the length decoder
 */
export type LengthDecoderResult = {
  done: boolean;
  length: number;
  numLengthBytes: number;
};

/**
 * Creates a stateful decoder function for processing variable-length encoded numbers
 * @returns Function that processes one byte at a time and returns decoding status
 * @throws Error if the encoded length is greater than 4 bytes
 */
export function getLengthDecoder(): (
  encodedByte: number,
) => LengthDecoderResult {
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
