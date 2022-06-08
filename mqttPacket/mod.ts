import {
  ClientId,
  Dup,
  PacketId,
  PacketType,
  Payload,
  QoS,
  ReturnCodes,
  Topic,
  TopicFilter,
} from "./types.ts";
import { invalidTopic, invalidTopicFilter, invalidUTF8 } from "./validators.ts";
import { decodeLength, encodeLength } from "./length.ts";
import connect, { ConnectPacket } from "./connect.ts";
import connack, { AuthenticationResult, ConnackPacket } from "./connack.ts";
import publish, { PublishPacket } from "./publish.ts";
import puback, { PubackPacket } from "./puback.ts";
import pubrec, { PubrecPacket } from "./pubrec.ts";
import pubrel, { PubrelPacket } from "./pubrel.ts";
import pubcomp, { PubcompPacket } from "./pubcomp.ts";
import subscribe, { SubscribePacket } from "./subscribe.ts";
import suback, { SubackPacket } from "./suback.ts";
import unsubscribe, { UnsubscribePacket } from "./unsubscribe.ts";
import unsuback, { UnsubackPacket } from "./unsuback.ts";
import pingreq, { PingreqPacket } from "./pingreq.ts";
import pingres, { PingresPacket } from "./pingres.ts";
import disconnect, { DisconnectPacket } from "./disconnect.ts";
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
  Topic,
  TopicFilter,
  UnsubackPacket,
  UnsubscribePacket,
};

export type { Subscription } from "./subscribe.ts";

export {
  AuthenticationResult,
  decodeLength,
  encodeLength,
  invalidTopic,
  invalidTopicFilter,
  invalidUTF8,
  PacketType,
};

const packetsByType = [
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
];

export function encode(packet: AnyPacket) {
  const packetType: number = packet.type;
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
  const packetType: PacketType = firstByte >> 4;
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
