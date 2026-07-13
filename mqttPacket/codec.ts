import type { CodecOpts, TPacketType } from "./types.ts";
import { DecoderError } from "./decoder.ts";
import { decodeLength } from "./length.ts";

// import encoder/decoder for each packet type
import * as connect from "./connect.ts";
import * as connack from "./connack.ts";
import * as publish from "./publish.ts";
import * as anyAck from "./pubblishAcks.ts";
import * as subscribe from "./subscribe.ts";
import * as suback from "./suback.ts";
import * as unsubscribe from "./unsubscribe.ts";
import * as unsuback from "./unsuback.ts";
import * as pingreq from "./pingreq.ts";
import * as pingres from "./pingres.ts";
import * as disconnect from "./disconnect.ts";
import * as auth from "./auth.ts";

// import the Typescript types of the packet types
import type { ConnectPacket } from "./connect.ts";
import type { ConnackPacket } from "./connack.ts";
import type { PublishPacket } from "./publish.ts";
import type {
  PubackPacket,
  PubcompPacket,
  PubrecPacket,
  PubrelPacket,
} from "./pubblishAcks.ts";
import type { SubscribePacket } from "./subscribe.ts";
import type { SubackPacket } from "./suback.ts";
import type { UnsubscribePacket } from "./unsubscribe.ts";
import type { UnsubackPacket } from "./unsuback.ts";
import type { PingreqPacket } from "./pingreq.ts";
import type { PingresPacket } from "./pingres.ts";
import type { DisconnectPacket } from "./disconnect.ts";
import type { AuthPacket } from "./auth.ts";

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
  | DisconnectPacket
  | AuthPacket;

/**
 * Array mapping MQTT packet types to their corresponding encode/decode handlers
 * Index corresponds to packet type number.
 */
const packetsByType = [
  null,
  connect, // 1
  connack, // 2
  publish, // 3
  anyAck, // 4 puback
  anyAck, // 5 pubrec
  anyAck, // 6 pubrel
  anyAck, // 7 pubcomp
  subscribe, // 8
  suback, // 9
  unsubscribe, // 10
  unsuback, // 11
  pingreq, // 12
  pingres, // 13
  disconnect, // 14
  auth, // 15
] as const;

/**
 * @function encode
 * @description Encodes an MQTT packet object into a binary Uint8Array format
 * @param {AnyPacket} packet - The MQTT packet object to encode
 * @param {CodecOpts} codecOpts - options to use during encoding
 * @returns {Uint8Array} The encoded packet as a binary buffer
 * @throws {Error} If packet encoding fails
 */
export function encode(packet: AnyPacket, codecOpts: CodecOpts): Uint8Array {
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
 * @throws {DecoderError} If packet decoding fails
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
    packetType as TPacketType,
  );
  if (packet !== undefined) {
    return packet;
  }
  throw new DecoderError("packet decoding failed");
}

/**
 * @function decode
 * @description Decodes a complete MQTT packet from binary format into a packet object,
 *  its basically a wrapper around decodePayload
 *
 * @param {Uint8Array} buffer - The binary buffer containing the complete MQTT packet
 * @param {CodecOpts} codecOpts - the options for the decoder
 * @returns {AnyPacket} The decoded MQTT packet object
 * @throws {DecoderError} If packet decoding fails due to invalid format or insufficient data
 */
export function decode(buffer: Uint8Array, codecOpts: CodecOpts): AnyPacket {
  if (buffer.length < 2) {
    throw new DecoderError("Packet decoding failed");
  }
  const { length, numLengthBytes } = decodeLength(buffer, 1);
  const start = numLengthBytes + 1;
  const end = start + length;
  return decodePayload(buffer[0] || 0, buffer.subarray(start, end), codecOpts);
}
