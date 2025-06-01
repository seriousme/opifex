import type { PacketId, ProtocolLevel, TPacketType } from "./types.ts";
import { PacketType } from "./PacketType.ts";
import { Decoder, DecoderError } from "./decoder.ts";
import { Encoder } from "./encoder.ts";

/**
 * PubrelPacket is the packet sent by the Server to the Client in response to a
 * PubrecPacket. It is the third packet of the QoS 2 protocol exchange.
 */
export type PubrelPacket = {
  type: TPacketType;
  id: PacketId;
};

export const pubrel: {
  encode(packet: PubrelPacket): { flags: number; bytes: number[] };
  decode(
    buffer: Uint8Array,
    flags: number,
    protocolLevel: ProtocolLevel,
  ): PubrelPacket;
} = {
  encode(packet: PubrelPacket): { flags: number; bytes: number[] } {
    const flags = 0;
    const encoder = new Encoder();
    encoder.setInt16(packet.id);
    return { flags, bytes: encoder.done() };
  },

  decode(
    buffer: Uint8Array,
    _flags: number,
    protocolLevel: ProtocolLevel,
  ): PubrelPacket {
    if (protocolLevel === 5) {
      throw new DecoderError("Invalid protocol version");
    }
    const decoder = new Decoder(buffer);
    const id = decoder.getInt16();
    decoder.done();
    return {
      type: PacketType.pubrel,
      id,
    };
  },
};
