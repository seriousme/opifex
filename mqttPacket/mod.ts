/**
 * @module MQTT Packet Encoding/Decoding
 * @description This module provides comprehensive encoding and decoding functionality for MQTT packets
 * used in both server and client implementations. It handles all MQTT packet types and their
 * transformations between binary and object representations.
 */

export { decode, decodePayload, encode } from "./codec.ts";
export type { AnyPacket } from "./codec.ts";

export type { ConnectPacket } from "./connect.ts";
export type { ConnackPacket } from "./connack.ts";
export type { PublishPacket } from "./publish.ts";
export type { Subscription } from "./subscribe.ts";
export type { SubscribePacket } from "./subscribe.ts";
export type { SubackPacket } from "./suback.ts";
export type { UnsubscribePacket } from "./unsubscribe.ts";
export type { UnsubackPacket } from "./unsuback.ts";
export type { PingreqPacket } from "./pingreq.ts";
export type { PingresPacket } from "./pingres.ts";
export type { DisconnectPacket } from "./disconnect.ts";
export type { AuthPacket } from "./auth.ts";
export type {
  PubackPacket,
  PubcompPacket,
  PubrecPacket,
  PubrelPacket,
} from "./pubblishAcks.ts";

export { MQTTLevel } from "./protocolLevels.ts";
export { RetainHandling } from "./RetainHandling.ts";
export { ReasonCode, ReasonCodeByNumber } from "./ReasonCode.ts";
export { PacketNameByType, PacketType } from "./PacketType.ts";
export {
  AuthenticationResult,
  AuthenticationResultByNumber,
} from "./AuthenticationResult.ts";
export { invalidTopic, invalidTopicFilter, invalidUTF8 } from "./validators.ts";
export { decodeLength, encodeLength } from "./length.ts";
export { getLengthDecoder } from "../mqttPacket/length.ts";

export type { LengthDecoderResult } from "../mqttPacket/length.ts";
export type {
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
  TReasonCode,
  TRetainHandling,
  UTF8StringPair,
} from "./types.ts";
