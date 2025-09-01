import type {
  CodecOpts,
  PacketId,
  ProtocolLevelNoV5,
  TPacketType,
} from "./types.ts";
import type { TReasonCode } from "./ReasonCode.ts";
import type { PubackProperties } from "./Properties.ts";
import { PacketType } from "./PacketType.ts";
import { Decoder } from "./decoder.ts";
import { Encoder } from "./encoder.ts";

/**
 * PubackPacket is sent to indicate publish complete (QoS 1)
 * Pubrec is sent to indicate publish received (QoS 2)
 * Pubrel is sent to indicate publish release (QoS 2)
 * Pubcomp is sent to indicate publish complete (QoS 2)
 *
 * all 4 packets are identical except for packet type
 */
export type AckPacketV4<T> = {
  type: TPacketType;
  protocolLevel: ProtocolLevelNoV5;
  id: PacketId;
};

export type AckPacketV5<T> = {
  type: TPacketType;
  protocolLevel: 5;
  id: PacketId;
  reasonCode?: TReasonCode;
  properties?: PubackProperties;
};

export type AckPacket<T> = AckPacketV4<T> | AckPacketV5<T>;
export type PubackPacket = AckPacket<typeof PacketType.puback>;
export type PubrecPacket = AckPacket<typeof PacketType.pubrec>;
export type PubrelPacket = AckPacket<typeof PacketType.pubrel>;
export type PubcompPacket = AckPacket<typeof PacketType.pubcomp>;

export type AnyAckPacket =
  | PubackPacket
  | PubrecPacket
  | PubrelPacket
  | PubcompPacket;

export const anyAck: {
  encode(packet: AnyAckPacket, codecOpts: CodecOpts): Uint8Array;
  decode(
    buffer: Uint8Array,
    _flags: number,
    codecOpts: CodecOpts,
    packetType: TPacketType,
  ): AnyAckPacket;
} = {
  encode(packet: AnyAckPacket, codecOpts: CodecOpts): Uint8Array {
    const flags = 0;
    const encoder = new Encoder(packet.type);
    encoder.setInt16(packet.id);
    if (packet.protocolLevel === 5) {
      const reasonCode = packet.reasonCode || 0;
      if (reasonCode === 0 && !packet.properties) {
        return encoder.done(flags);
      }
      encoder.setReasonCode(reasonCode);
      encoder.setProperties(
        packet.properties || {},
        packet.type,
        codecOpts.maxOutgoingPacketSize,
      );
    }
    return encoder.done(flags);
  },

  decode(
    buffer: Uint8Array,
    _flags: number,
    codecOpts: CodecOpts,
    packetType: TPacketType,
  ): AnyAckPacket {
    const decoder = new Decoder( packetType,buffer);
    const id = decoder.getInt16();
    if (codecOpts.protocolLevel !== 5) {
      decoder.done();
      return {
        type: packetType,
        protocolLevel: codecOpts.protocolLevel,
        id,
      };
    }
    if (decoder.atEnd()) {
      return {
        type: packetType,
        protocolLevel: 5,
        id,
        reasonCode: 0,
      };
    }
    const reasonCode = decoder.getReasonCode();
    const properties = decoder.getProperties(packetType);
    return {
      type: packetType,
      protocolLevel: 5,
      id,
      reasonCode,
      properties,
    };
  },
};
