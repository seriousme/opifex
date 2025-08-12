/**
 * @module MQTT Packet Encoding/Decoding
 * @description This module provides comprehensive encoding and decoding functionality for MQTT packets
 * used in both server and client implementations. It handles all MQTT packet types and their
 * transformations between binary and object representations.
 */

import type {
  ClientId,
  CodecOpts,
  Dup,
  PacketId,
  Payload,
  ProtocolLevel,
  QoS,
  ReturnCodes,
  TAuthenticationResult,
  Topic,
  TopicFilter,
  TPacketType,
  UTF8StringPair,
} from "./types.ts";

export { MQTTLevel } from "./protocolLevels.ts";
import { PacketNameByType, PacketType } from "./PacketType.ts";
import { invalidTopic, invalidTopicFilter, invalidUTF8 } from "./validators.ts";
import { decodeLength, encodeLength } from "./length.ts";
import { connect } from "./connect.ts";
import { connack } from "./connack.ts";
import {
  AuthenticationResult,
  AuthenticationResultByNumber,
} from "./AuthenticationResult.ts";
import { publish } from "./publish.ts";
import { puback } from "./puback.ts";
import { pubrec } from "./pubrec.ts";
import { pubrel } from "./pubrel.ts";
import { pubcomp } from "./pubcomp.ts";
import { subscribe } from "./subscribe.ts";
import { suback } from "./suback.ts";
import { unsubscribe } from "./unsubscribe.ts";
import { unsuback } from "./unsuback.ts";
import { pingreq } from "./pingreq.ts";
import { pingres } from "./pingres.ts";
import { disconnect } from "./disconnect.ts";
import { DecoderError } from "./decoder.ts";

import type { ConnectPacket } from "./connect.ts";
import type { ConnackPacket } from "./connack.ts";
import type { PublishPacket } from "./publish.ts";
import type { PubackPacket } from "./puback.ts";
import type { PubrecPacket } from "./pubrec.ts";
import type { PubrelPacket } from "./pubrel.ts";
import type { PubcompPacket } from "./pubcomp.ts";
import type { SubscribePacket } from "./subscribe.ts";
import type { SubackPacket } from "./suback.ts";
import type { UnsubscribePacket } from "./unsubscribe.ts";
import type { UnsubackPacket } from "./unsuback.ts";
import type { PingreqPacket } from "./pingreq.ts";
import type { PingresPacket } from "./pingres.ts";
import type { DisconnectPacket } from "./disconnect.ts";

/**
 * this can be any possible MQTT packet
 */
export type AnyPacket =
  | ConnectPacket
  | ConnackPacket
  | PublishPacket
  | PubackPacket
  | PubrecPacket
  | PubrelPacket
  | PubcompPacket
  | SubscribePacket
  | SubackPacket
  | UnsubscribePacket
  | UnsubackPacket
  | PingreqPacket
  | PingresPacket
  | DisconnectPacket;

export type {
  ClientId,
  CodecOpts,
  ConnackPacket,
  ConnectPacket,
  DisconnectPacket,
  Dup,
  PacketId,
  Payload,
  PingreqPacket,
  PingresPacket,
  ProtocolLevel,
  PubackPacket,
  PubcompPacket,
  PublishPacket,
  PubrecPacket,
  PubrelPacket,
  QoS,
  ReturnCodes,
  SubackPacket,
  SubscribePacket,
  TAuthenticationResult,
  Topic,
  TopicFilter,
  TPacketType,
  UnsubackPacket,
  UnsubscribePacket,
  UTF8StringPair,
};

export type { Subscription } from "./subscribe.ts";

export {
  AuthenticationResult,
  AuthenticationResultByNumber,
  decodeLength,
  encodeLength,
  invalidTopic,
  invalidTopicFilter,
  invalidUTF8,
  PacketNameByType,
  PacketType,
};

/**
 * Array mapping MQTT packet types to their corresponding encode/decode handlers
 * Index corresponds to packet type number.
 */
export const packetsByType = [
  null,
  connect, // 1
  connack, // 2
  publish, // 3
  puback, // 4
  pubrec, // 5
  pubrel, // 6
  pubcomp, // 7
  subscribe, // 8
  suback, // 9
  unsubscribe, // 10
  unsuback, // 11
  pingreq, // 12
  pingres, // 13
  disconnect, // 14
] as const;

/**
 * @function encode
 * @description Encodes an MQTT packet object into a binary Uint8Array format
 * @param {AnyPacket} packet - The MQTT packet object to encode
 * @param {CodecOpts} codecOpts - options to use during encoding
 * @returns {Uint8Array} The encoded packet as a binary buffer
 * @throws {Error} If packet encoding fails
 */
export function encode(
  packet: AnyPacket,
  codecOpts: CodecOpts,
): Uint8Array {
  const packetType: number = packet.type;
  // deno-lint-ignore no-explicit-any
  const pkt: any = packet;
  const encoded = packetsByType[packetType]?.encode(pkt, codecOpts);
  if (!encoded) {
    throw Error("Packet encoding failed");
  }
  return encoded;
}

/**
 * @function decodePayload
 * @description Decodes a packet payload from binary format into an MQTT packet object
 * @param {number} firstByte - The first byte of the MQTT packet containing type and flags
 * @param {Uint8Array} buffer - The binary buffer containing the packet payload
 * @param {CodecOpts} codecOpts - options to use during encoding
 * @returns {AnyPacket} The decoded MQTT packet object
 * @throws {Error} If packet decoding fails
 */

export function decodePayload(
  firstByte: number,
  buffer: Uint8Array,
  codecOpts: CodecOpts,
): AnyPacket {
  const packetType = firstByte >> 4;
  const flags = firstByte & 0x0f;
  const packet = packetsByType[packetType]?.decode(
    buffer,
    flags,
    codecOpts,
  );
  if (packet !== undefined) {
    return packet;
  }
  throw new Error("packet decoding failed");
}

/**
 * @function decode
 * @description Decodes a complete MQTT packet from binary format into a packet object
 * @param {Uint8Array} buffer - The binary buffer containing the complete MQTT packet
 * @param {CodecOpts} codecOpts - the options for the decoder
 * @returns {AnyPacket} The decoded MQTT packet object
 * @throws {DecoderError} If packet decoding fails due to invalid format or insufficient data
 */
export function decode(
  buffer: Uint8Array,
  codecOpts: CodecOpts,
): AnyPacket {
  if (buffer.length < 2) {
    throw new DecoderError("Packet decoding failed");
  }
  const { length, numLengthBytes } = decodeLength(buffer, 1);
  const start = numLengthBytes + 1;
  const end = start + length;
  return decodePayload(buffer[0], buffer.subarray(start, end), codecOpts);
}

export { getLengthDecoder } from "../mqttPacket/length.ts";
export type { LengthDecoderResult } from "../mqttPacket/length.ts";
