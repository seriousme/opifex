import type { PacketId, ProtocolLevel, TPacketType } from "./types.ts";
import { PacketType } from "./PacketType.ts";
import { Decoder, DecoderError } from "./decoder.ts";
import { Encoder } from "./encoder.ts";

/**
 * PubcompPacket is sent to indicate publish complete
 * It is the fourth packet of the QoS 2 protocol exchange.
 */
export type PubcompPacket = {
  type: TPacketType;
  id: PacketId;
};

export const pubcomp: {
  encode(packet: PubcompPacket): Uint8Array;
  decode(
    buffer: Uint8Array,
    flags: number,
    protocolLevel: ProtocolLevel,
  ): PubcompPacket;
} = {
  encode(packet: PubcompPacket): Uint8Array {
    const flags = 0;
    const encoder = new Encoder(packet.type);
    encoder.setInt16(packet.id);
    return encoder.done(flags);
  },

  decode(
    buffer: Uint8Array,
    _flags: number,
    protocolLevel: ProtocolLevel,
  ): PubcompPacket {
    if (protocolLevel === 5) {
      throw new DecoderError("Invalid protocol version");
    }
    const decoder = new Decoder(buffer);
    const id = decoder.getInt16();
    decoder.done();
    return {
      type: PacketType.pubcomp,
      id,
    };
  },
};
