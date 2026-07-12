import type {
  CodecOpts,
  PacketId,
  ProtocolLevelNoV5,
  Topic,
  TopicFilter,
  TPacketType,
} from "./types.ts";
import type { UnsubscribeProperties } from "./Properties.ts";
import { PacketType } from "./PacketType.ts";
import { Encoder } from "./encoder.ts";
import { Decoder, DecoderError } from "./decoder.ts";

/**
 * Represents an MQTT UNSUBSCRIBE packet conforming to MQTT version 3.1.1 (Protocol Level 4) or lower.
 */
export type UnsubscribePacketV4 = {
  /** The type of the MQTT control packet. */
  type: TPacketType;
  /** The protocol version level, restricted to non-v5 variants. */
  protocolLevel: ProtocolLevelNoV5;
  /** The unique 16-bit packet identifier. */
  id: PacketId;
  /** The list of topic filters from which the client intends to unsubscribe. */
  topicFilters: TopicFilter[];
};

/**
 * Represents an MQTT UNSUBSCRIBE packet conforming to MQTT version 5.0.
 */
export type UnsubscribePacketV5 = {
  /** The type of the MQTT control packet. */
  type: TPacketType;
  /** The protocol version level, strictly set to 5. */
  protocolLevel: 5;
  /** The unique 16-bit packet identifier. */
  id: PacketId;
  /** Optional user and protocol properties introduced in MQTT v5. */
  properties?: UnsubscribeProperties;
  /** The list of topic filters from which the client intends to unsubscribe. */
  topicFilters: TopicFilter[];
};

/**
 * Represents a union of available MQTT UNSUBSCRIBE packets (v4 or v5) sent from client to server.
 */
export type UnsubscribePacket = UnsubscribePacketV4 | UnsubscribePacketV5;

/**
 * Codec utility object responsible for encoding and decoding MQTT UNSUBSCRIBE control packets.
 */
export function encode(
  packet: UnsubscribePacket,
  codecOpts: CodecOpts,
): Uint8Array {
  // Bits 3,2,1 and 0 of the fixed header of the UNSUBSCRIBE Control Packet are reserved and
  // MUST be set to 0,0,1 and 0 respectively. The Server MUST treat any other value as
  // malformed and close the Network Connection [MQTT-3.10.1-1].
  const flags = 0b0010;

  const encoder = new Encoder(packet.type);
  encoder.setInt16(packet.id);
  if (packet.protocolLevel === 5) {
    encoder.setProperties(
      packet.properties || {},
      PacketType.unsubscribe,
      codecOpts.maxOutgoingPacketSize,
    );
  }
  for (const topicFilter of packet.topicFilters) {
    encoder.setTopicFilter(topicFilter);
  }
  return encoder.done(flags);
}

export function decode(
  buffer: Uint8Array,
  flags: number,
  codecOpts: CodecOpts,
  packetType: TPacketType,
): UnsubscribePacket {
  if (flags !== 0b0010) {
    throw new DecoderError("Invalid header");
  }
  const decoder = new Decoder(packetType, buffer);
  const id = decoder.getInt16();
  let properties = {};
  if (codecOpts.protocolLevel === 5) {
    properties = decoder.getProperties(PacketType.unsubscribe);
  }
  const topicFilters: Topic[] = [];
  do {
    const topicFilter = decoder.getTopicFilter();
    topicFilters.push(topicFilter);
  } while (!decoder.atEnd());
  decoder.done();
  if (codecOpts.protocolLevel !== 5) {
    return {
      type: PacketType.unsubscribe,
      protocolLevel: codecOpts.protocolLevel,
      id,
      topicFilters,
    };
  }
  return {
    type: PacketType.unsubscribe,
    protocolLevel: 5,
    id,
    properties,
    topicFilters,
  };
}
