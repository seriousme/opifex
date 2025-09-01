import type {
  CodecOpts,
  PacketId,
  Topic,
  TopicFilter,
  TPacketType,
} from "./types.ts";
import { PacketType } from "./PacketType.ts";
import { BitMask } from "./BitMask.ts";
import { Encoder } from "./encoder.ts";
import { booleanFlag, Decoder, DecoderError } from "./decoder.ts";

/**
 * UnsubscribePacket is sent from client to server to unsubscribe from topics
 */
export type UnsubscribePacket = {
  type: TPacketType;
  id: PacketId;
  topicFilters: TopicFilter[];
};

export const unsubscribe: {
  encode(packet: UnsubscribePacket, _codecOpts: CodecOpts): Uint8Array;
  decode(
    buffer: Uint8Array,
    flags: number,
    codecOpts: CodecOpts,
    packetType: TPacketType,
  ): UnsubscribePacket;
} = {
  encode(packet: UnsubscribePacket, _codecOpts: CodecOpts): Uint8Array {
    // Bits 3,2,1 and 0 of the fixed header of the UNSUBSCRIBE Control Packet are reserved and
    // MUST be set to 0,0,1 and 0 respectively. The Server MUST treat any other value as
    // malformed and close the Network Connection [MQTT-3.10.1-1].
    const flags = 0b0010;

    const encoder = new Encoder(packet.type);
    encoder.setInt16(packet.id);
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
    if (codecOpts.protocolLevel === 5) {
      throw new DecoderError("Invalid protocol version");
    }
    if (!booleanFlag(flags, BitMask.bit1)) {
      throw new DecoderError("Invalid header");
    }
    const decoder = new Decoder( packetType,buffer);
    const id = decoder.getInt16();

    const topicFilters: Topic[] = [];
    do {
      const topicFilter = decoder.getTopicFilter();
      topicFilters.push(topicFilter);
    } while (!decoder.atEnd());
    decoder.done();

    return {
      type: PacketType.unsubscribe,
      id,
      topicFilters,
    };
  },
};
