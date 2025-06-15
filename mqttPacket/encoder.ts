import type {
  Topic,
  TopicFilter,
  TPacketType,
  UTF8StringPair,
} from "./types.ts";
import { invalidTopic, invalidTopicFilter } from "./validators.ts";
import { encodeLength } from "./length.ts";

const utf8Encoder = new TextEncoder();
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
type bufValue = number[] | Uint8Array;
export class Encoder {
  /** Internal bufferlist to store items */
  private buffers: bufValue[];

  /** Number of bytes in the buffer */
  private numBytes: number;

  /** Packet type */
  private packetType: TPacketType;

  /**
   * Creates a new Encoder instance
   */
  constructor(packetType: TPacketType) {
    this.buffers = [];
    this.numBytes = 0;
    this.packetType = packetType;
  }

  /**
   * @param value
   */
  addArray(value: number[] | Uint8Array): this {
    this.buffers.push(value);
    this.numBytes += value.length;
    return this;
  }

  /**
   * Adds a single byte to the buffer
   * @param value - Byte value to add (0-255)
   * @returns The encoder instance for chaining
   */
  setByte(value: number): this {
    this.buffers.push([value]);
    this.numBytes++;
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
   * adds a 4 byte integer from the buffer (for v5)
   * @param value - 32-bit integer to encode and add
   * @returns The encoder instance for chaining
   */
  setInt32(value: number): this {
    this.setInt16(value >> 16);
    this.setInt16(value & 0xffff);
    return this;
  }

  /**
   * adds a variable byte integer to the buffer (for v5)
   * @param value - integer to encode and add
   * @returns The encoder instance for chaining
   */
  setVariableByteInteger(value: number): this {
    this.addArray(encodeLength(value));
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
    this.addArray(value);
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
   * Adds a UTF-8 string pair from the buffer (for v5)
   * @param stringPair - UTF8StringPair
   * @returns The encoder instance for chaining
   */
  setUtf8StringPair([name, value]: UTF8StringPair): this {
    this.setUtf8String(name);
    this.setUtf8String(value);
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
    this.addArray(value);
    return this;
  }

  /**
   * Returns the final encoded buffer
   * @returns Array containing all encoded bytes
   */
  done(flags: number): Uint8Array {
    const packetType = this.packetType;
    const encodedLength = encodeLength(this.numBytes);
    const totalLength = 1 + encodedLength.length + this.numBytes;
    const result = new Uint8Array(totalLength);
    let pos = 0;
    result.set([packetType << 4 | flags], pos++);
    result.set(encodedLength, pos);
    pos += encodedLength.length;
    for (const buffer of this.buffers) {
      result.set(buffer, pos);
      pos += buffer.length;
    }
    return result;
  }
}
