import type { TBitMask, Topic, TopicFilter } from "./types.ts";
import { invalidTopic, invalidTopicFilter } from "./validators.ts";

const utf8Decoder = new TextDecoder("utf-8");
/**
 * Checks if a specific bit flag is set in a byte using a bitmask
 * @param byte - The byte to check
 * @param mask - The bitmask to apply
 * @returns True if the flag is set, false otherwise
 */
export function booleanFlag(byte: number, mask: TBitMask): boolean {
  return !!(byte & mask);
}

/**
 * Checks if a buffer is empty, throws error if not empty
 * @param buf - The buffer to check
 * @throws {DecoderError} If buffer is not empty
 */
export function isEmptyBuf(buf: Uint8Array): void {
  if (buf.length > 0) {
    throw new DecoderError("Packet too long");
  }
}

/**
 * Checks if flags are empty (zero), throws error if not
 * @param flags - The flags value to check
 * @throws {DecoderError} If flags are not zero
 */
export function hasEmptyFlags(flags: number): void {
  if (flags !== 0) {
    throw new DecoderError("Invalid fixed header flags");
  }
}

/**
 * Custom error class for decoder errors
 */
export class DecoderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecoderError";
  }
}

/**
 * Decoder class for parsing MQTT packets
 */
export class Decoder {
  private buf: Uint8Array;
  private pos: number;
  private len: number;

  /**
   * Creates a new Decoder instance
   * @param buf - The buffer to decode
   * @param pos - Starting position in the buffer (default: 0)
   */
  constructor(buf: Uint8Array, pos: number = 0) {
    this.buf = buf;
    this.pos = pos;
    this.len = buf.length;
  }

  /**
   * Checks if the current position is valid
   * @param pos - Position to check
   * @throws {DecoderError} If position exceeds buffer length
   */
  checkpos(pos: number): void {
    if (pos > this.len) {
      throw new DecoderError("Packet too short");
    }
  }

  /**
   * Gets a single byte from the buffer
   * @returns The byte value
   */
  getByte(): number {
    this.checkpos(this.pos);
    return this.buf[this.pos++];
  }

  /**
   * Gets a 16-bit integer from the buffer
   * @returns The 16-bit integer value
   */
  getInt16(): number {
    const msb = this.getByte();
    const lsb = this.getByte();
    return (msb << 8) | lsb;
  }

  /**
   * Gets a byte array from the buffer
   * @returns A subarray of the buffer
   */
  getByteArray(): Uint8Array {
    const len = this.getInt16();
    const start = this.pos;
    const end = this.pos + len;
    this.pos = end;
    this.checkpos(end);
    return this.buf.subarray(start, end);
  }

  /**
   * Gets a UTF-8 string from the buffer
   * @returns The decoded UTF-8 string
   */
  getUtf8String(): string {
    const str = utf8Decoder.decode(this.getByteArray());
    return str;
  }

  /**
   * Gets a topic from the buffer
   * @returns The decoded topic
   * @throws {DecoderError} If topic is invalid
   */
  getTopic(): Topic {
    const topic = this.getUtf8String();
    if (invalidTopic(topic)) {
      throw new DecoderError(
        "Topic must contain valid UTF-8 and contain more than 1 byte and no wildcards",
      );
    }
    return topic;
  }

  /**
   * Gets a topic filter from the buffer
   * @returns The decoded topic filter
   * @throws {DecoderError} If topic filter is invalid
   */
  getTopicFilter(): TopicFilter {
    const topicFilter = this.getUtf8String();
    if (invalidTopicFilter(topicFilter)) {
      throw new DecoderError(
        "Topicfilter must contain valid UTF-8 and contain more than 1 byte and valid wildcards",
      );
    }
    return topicFilter;
  }

  /**
   * Gets the remaining bytes from the current position to the end
   * @returns The remaining bytes as a subarray
   */
  getRemainder() {
    const start = this.pos;
    const end = this.len;
    this.pos = end;
    return this.buf.subarray(start, end);
  }

  /**
   * Checks if decoder has reached the end of the buffer
   * @returns True if at end, false otherwise
   */
  atEnd(): boolean {
    if (this.len === this.pos) {
      return true;
    }
    return false;
  }

  /**
   * Checks if decoding is complete
   * @returns True if complete
   * @throws {DecoderError} If packet is too long
   */
  done(): boolean {
    if (this.atEnd()) {
      return true;
    }
    throw new DecoderError("Packet too long");
  }
}
