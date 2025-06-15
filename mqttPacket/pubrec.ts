import type { PacketId, ProtocolLevel, TPacketType } from "./types.ts";
import { PacketType } from "./PacketType.ts";
import { Decoder, DecoderError } from "./decoder.ts";
import { Encoder } from "./encoder.ts";

/**
 * PubrecPacket indicates publish received
 * It is the second packet of the QoS 2 protocol exchange.
 */
export type PubrecPacket = {
  type: TPacketType;
  id: PacketId;
};

export const pubrec: {
  encode(packet: PubrecPacket, _maximumPacketSize: number): Uint8Array;
  decode(
    buffer: Uint8Array,
    flags: number,
    protocolLevel: ProtocolLevel,
  ): PubrecPacket;
} = {
  encode(packet: PubrecPacket, _maximumPacketSize: number): Uint8Array {
    const flags = 0;
    const encoder = new Encoder(packet.type);
    encoder.setInt16(packet.id);
    return encoder.done(flags);
  },

  decode(
    buffer: Uint8Array,
    _flags: number,
    protocolLevel: ProtocolLevel,
  ): PubrecPacket {
    if (protocolLevel === 5) {
      throw new DecoderError("Invalid protocol version");
    }
    const decoder = new Decoder(buffer);
    const id = decoder.getInt16();
    decoder.done();
    return {
      type: PacketType.pubrec,
      id,
    };
  },
};
