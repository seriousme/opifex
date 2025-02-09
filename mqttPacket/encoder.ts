const utf8Encoder = new TextEncoder();
import type { Topic, TopicFilter } from "./types.ts";
import { invalidTopic, invalidTopicFilter } from "./validators.ts";

/**
 * Custom error class for encoding operations
 */
export class EncoderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncoderError";
  }
}

/**
 * Encoder class for MQTT packet encoding
 */
export class Encoder {
  /** Internal buffer to store encoded bytes */
  private buffer: number[];

  /**
   * Creates a new Encoder instance
   */
  constructor() {
    this.buffer = [];
  }

  /**
   * Adds a single byte to the buffer
   * @param value - Byte value to add (0-255)
   * @returns The encoder instance for chaining
   */
  setByte(value: number): this {
    this.buffer.push(value);
    return this;
  }

  /**
   * Adds a 16-bit integer to the buffer in big-endian format
   * @param value - 16-bit integer value to add
   * @returns The encoder instance for chaining
   */
  setInt16(value: number): this {
    this.setByte(value >> 8);
    this.setByte(value & 0xff);
    return this;
  }

  /**
   * Adds a byte array to the buffer with length prefix
   * @param value - Byte array to add
   * @throws {EncoderError} If array length exceeds 0xffff bytes
   * @returns The encoder instance for chaining
   */
  setByteArray(value: Uint8Array): this {
    if (value.length > 0xffff) {
      throw new EncoderError("More than 0xffff bytes of data");
    }
    this.setInt16(value.length);
    this.buffer.push(...value);
    return this;
  }

  /**
   * Adds a UTF-8 encoded string to the buffer with length prefix
   * @param value - String to encode and add
   * @returns The encoder instance for chaining
   */
  setUtf8String(value: string): this {
    this.setByteArray(utf8Encoder.encode(value));
    return this;
  }

  /**
   * Adds an MQTT topic string to the buffer
   * @param value - Topic string to add
   * @throws {EncoderError} If topic is invalid
   * @returns The encoder instance for chaining
   */
  setTopic(value: Topic): this {
    if (invalidTopic(value)) {
      throw new EncoderError(
        "Topic must contain valid UTF-8 and contain more than 1 byte and no wildcards",
      );
    }
    this.setUtf8String(value);
    return this;
  }

  /**
   * Adds an MQTT topic filter string to the buffer
   * @param value - Topic filter string to add
   * @throws {EncoderError} If topic filter is invalid
   * @returns The encoder instance for chaining
   */
  setTopicFilter(value: TopicFilter): this {
    if (invalidTopicFilter(value)) {
      throw new EncoderError(
        "Topicfilter must contain valid UTF-8 and contain more than 1 byte and valid wildcards",
      );
    }
    this.setUtf8String(value);
    return this;
  }

  /**
   * Adds remaining bytes to the buffer without modification
   * @param value - Array of bytes to add
   * @returns The encoder instance for chaining
   */
  setRemainder(value: Uint8Array | number[]): this {
    this.buffer.push(...value);
    return this;
  }

  /**
   * Returns the final encoded buffer
   * @returns Array containing all encoded bytes
   */
  done(): number[] {
    return this.buffer;
  }
}
