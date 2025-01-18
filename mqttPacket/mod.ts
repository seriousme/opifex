import type {
  ClientId,
  Dup,
  PacketId,
  Payload,
  QoS,
  ReturnCodes,
  TAuthenticationResult,
  Topic,
  TopicFilter,
  TPacketType,
} from "./types.ts";
import { PacketNameByType, PacketType } from "./PacketType.ts";
import { invalidTopic, invalidTopicFilter, invalidUTF8 } from "./validators.ts";
import { decodeLength, encodeLength } from "./length.ts";
import { connect, type ConnectPacket } from "./connect.ts";
import { connack, type ConnackPacket } from "./connack.ts";
import {
  AuthenticationResult,
  AuthenticationResultByNumber,
} from "./AuthenticationResult.ts";
import { publish, type PublishPacket } from "./publish.ts";
import { puback, type PubackPacket } from "./puback.ts";
import { pubrec, type PubrecPacket } from "./pubrec.ts";
import { pubrel, type PubrelPacket } from "./pubrel.ts";
import { pubcomp, type PubcompPacket } from "./pubcomp.ts";
import { subscribe, type SubscribePacket } from "./subscribe.ts";
import { suback, type SubackPacket } from "./suback.ts";
import { unsubscribe, type UnsubscribePacket } from "./unsubscribe.ts";
import { unsuback, type UnsubackPacket } from "./unsuback.ts";
import { pingreq, type PingreqPacket } from "./pingreq.ts";
import { pingres, type PingresPacket } from "./pingres.ts";
import { disconnect, type DisconnectPacket } from "./disconnect.ts";
import { DecoderError } from "./decoder.ts";

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
  ConnackPacket,
  ConnectPacket,
  DisconnectPacket,
  Dup,
  PacketId,
  Payload,
  PingreqPacket,
  PingresPacket,
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

export function encode(packet: AnyPacket): Uint8Array {
  const packetType: number = packet.type;
  // deno-lint-ignore no-explicit-any
  const pkt: any = packet;
  const encoded = packetsByType[packetType]?.encode(pkt);
  if (!encoded) {
    throw Error("Packet encoding failed");
  }
  const { flags, bytes } = encoded;
  return Uint8Array.from([
    (packetType << 4) | flags,
    ...encodeLength(bytes.length),
    ...bytes,
  ]);
}

export function decodePayload(
  firstByte: number,
  buffer: Uint8Array,
): AnyPacket {
  const packetType = firstByte >> 4;
  const flags = firstByte & 0x0f;
  const packet = packetsByType[packetType]?.decode(buffer, flags);
  if (packet !== undefined) {
    return packet;
  }
  throw new Error("packet decoding failed");
}

export function decode(buffer: Uint8Array): AnyPacket {
  if (buffer.length < 2) {
    throw new DecoderError("Packet decoding failed");
  }
  const { length, numLengthBytes } = decodeLength(buffer, 1);
  const start = numLengthBytes + 1;
  const end = start + length;
  return decodePayload(buffer[0], buffer.subarray(start, end));
}

export { getLengthDecoder } from "../mqttPacket/length.ts";
export type { LengthDecoderResult } from "../mqttPacket/length.ts";
