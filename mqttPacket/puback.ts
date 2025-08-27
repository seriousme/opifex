import type {
  CodecOpts,
  PacketId,
  ProtocolLevelNoV5,
  TPacketType,
} from "./types.ts";
import type { PubackProperties } from "./Properties.ts";
import { PacketType } from "./PacketType.ts";
import { Decoder } from "./decoder.ts";
import { Encoder } from "./encoder.ts";

/**
 * PubackPacket is sent to indicate publish complete (QoS 1)
 */
export type PubackPacketV4 = {
  type: TPacketType;
  protocolLevel: ProtocolLevelNoV5;
  id: PacketId;
};

export type PubackPacketV5 = {
  type: TPacketType;
  protocolLevel: 5;
  id: PacketId;
  properties?: PubackProperties;
};

export type PubackPacket = PubackPacketV4 | PubackPacketV5;

export const puback: {
  encode(packet: PubackPacket, _codecOpts: CodecOpts): Uint8Array;
  decode(
    buffer: Uint8Array,
    _flags: number,
    codecOpts: CodecOpts,
  ): PubackPacket;
} = {
  encode(packet: PubackPacket, codecOpts: CodecOpts): Uint8Array {
    const flags = 0;
    const encoder = new Encoder(packet.type);
    encoder.setInt16(packet.id);
    if (packet.protocolLevel === 5) {
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
  ): PubackPacket {
    const decoder = new Decoder(buffer);
    const id = decoder.getInt16();
    if (codecOpts.protocolLevel !== 5) {
      decoder.done();
      return {
        type: PacketType.puback,
        protocolLevel: codecOpts.protocolLevel,
        id,
      };
    }
    const properties = decoder.getProperties(PacketType.puback);
    return {
      type: PacketType.puback,
      protocolLevel: 5,
      id,
      properties,
    };
  },
};
