import type {
  Topic,
  TopicFilter,
  TPacketType,
  TReasonCode,
  UTF8StringPair,
} from "./types.ts";

import type {
  Mqttv5PropertyTypes,
  PropsByPacketSetType,
  TPropertySetType,
  UserPropertyType,
  ValidPropertyNumber,
} from "./Properties.ts";

import {
  propertyByNumber,
  PropertyByPropertySetType,
  propertyKind,
  propertyToId,
  propertyToKind,
} from "./Properties.ts";

import { encodeLength } from "./length.ts";
import { invalidTopic, invalidTopicFilter } from "./validators.ts";
import { isValidReasonCode } from "./ReasonCode.ts";

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

  /** marker to rewind to */
  private marker: number;

  /**
   * Creates a new Encoder instance
   */
  constructor(packetType: TPacketType) {
    this.buffers = [];
    this.numBytes = 0;
    this.packetType = packetType;
    this.marker = 0;
  }

  encodedSize() {
    return this.numBytes;
  }

  setMarker() {
    this.marker = this.buffers.length;
  }

  rewindToMarker() {
    while (this.buffers.length > this.marker) {
      const buf = this.buffers.pop();
      this.numBytes -= buf?.length || 0;
    }
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
   * add lenght and buffers from this
   * @param encoder - the encoder to add it to
   */
  addToEncoder(encoder: Encoder) {
    encoder.setVariableByteInteger(this.numBytes);
    for (const buffer of this.buffers) {
      encoder.addArray(buffer);
    }
  }

  /**
   * Encode a single property
   * @param id - the id of the property
   * @param value  the value of the property
   * @returns
   */
  private setProperty(
    id: ValidPropertyNumber,
    value: Mqttv5PropertyTypes,
  ) {
    const kind = propertyToKind[id];
    if (kind === propertyKind.utf8StringPairs) {
      if (!Array.isArray(value)) {
        throw new EncoderError("userProperty must be an array");
      }
      for (const item of value as UserPropertyType) {
        if (!Array.isArray(item)) {
          throw new EncoderError("userProperty item must be an array");
        }
        this.setVariableByteInteger(id);
        this.setUtf8StringPair(item);
      }
      return;
    }

    this.setVariableByteInteger(id);
    switch (kind) {
      case propertyKind.boolean:
        this.setByte(!!value === true ? 1 : 0);
        break;
      case propertyKind.byte:
        this.setByte(value as number);
        break;
      case propertyKind.int16:
        this.setInt16(value as number);
        break;
      case propertyKind.int32:
        this.setInt32(value as number);
        break;
      case propertyKind.varInt:
        this.setVariableByteInteger(value as number);
        break;
      case propertyKind.byteArray:
        this.setByteArray(value as Uint8Array);
        break;
      case propertyKind.utf8string:
        this.setUtf8String(value as string);
        break;
    }
  }

  /**
   * Encode a set of properties respecting potential size limits
   * @param props - the properties to encode
   * @param propertySetType - the type of packet to encode for
   * @param maximumPacketSize - the maximum packet size to be consumed by properties
   */
  setProperties<T extends TPropertySetType>(
    props: PropsByPacketSetType[T],
    propertySetType: TPropertySetType,
    maximumPacketSize: number,
  ) {
    const propsEncoder = new Encoder(0);
    const allowedProps = PropertyByPropertySetType[propertySetType];
    const maxSize = maximumPacketSize - 1; // propertyLength takes at least a byte

    for (const id of allowedProps) {
      const label = propertyByNumber[id] as keyof PropsByPacketSetType[T];
      const value = props[label];
      if (value !== undefined && value !== null) {
        if (
          id === propertyToId.reasonString || id === propertyToId.userProperty
        ) {
          propsEncoder.setMarker();
          propsEncoder.setProperty(id, value as Mqttv5PropertyTypes);
          if (propsEncoder.encodedSize() > maxSize) {
            propsEncoder.rewindToMarker();
          }
        } else {
          propsEncoder.setProperty(id, value as Mqttv5PropertyTypes);
        }
      }
    }
    propsEncoder.addToEncoder(this);
  }

  setReasonCode(reasonCode: TReasonCode) {
    if (!isValidReasonCode(this.packetType, reasonCode)) {
      throw new EncoderError(
        `Reason code ${reasonCode} not allowed for packet type ${this.packetType}`,
      );
    }
    this.setByte(reasonCode);
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
