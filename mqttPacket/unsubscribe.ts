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
import { BitMask } from "./BitMask.ts";
import { Encoder } from "./encoder.ts";
import { booleanFlag, Decoder, DecoderError } from "./decoder.ts";

/**
 * UnsubscribePacket is sent from client to server to unsubscribe from topics
 */
export type UnsubscribePacketV4 = {
  type: TPacketType;
  protocolLevel: ProtocolLevelNoV5;
  id: PacketId;
  topicFilters: TopicFilter[];
};

export type UnsubscribePacketV5 = {
  type: TPacketType;
  protocolLevel: 5;
  id: PacketId;
  properties?: UnsubscribeProperties;
  topicFilters: TopicFilter[];
};

export type UnsubscribePacket = UnsubscribePacketV4 | UnsubscribePacketV5;

export const unsubscribe: {
  encode(packet: UnsubscribePacket, codecOpts: CodecOpts): Uint8Array;
  decode(
    buffer: Uint8Array,
    flags: number,
    codecOpts: CodecOpts,
    packetType: TPacketType,
  ): UnsubscribePacket;
} = {
  encode(packet: UnsubscribePacket, codecOpts: CodecOpts): Uint8Array {
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
  },

  decode(
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
  },
};
