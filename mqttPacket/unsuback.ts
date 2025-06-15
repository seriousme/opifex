import type { PacketId, ProtocolLevel, TPacketType } from "./types.ts";
import { PacketType } from "./PacketType.ts";
import { Decoder, DecoderError } from "./decoder.ts";
import { Encoder } from "./encoder.ts";

/**
 * UnsubackPacket is sent by the server to the client to confirm receipt
 * of an UnsubscribePacket.
 */
export type UnsubackPacket = {
  type: TPacketType;
  id: PacketId;
};

export const unsuback: {
  encode(packet: UnsubackPacket, _maximumPacketSize: number): Uint8Array;
  decode(
    buffer: Uint8Array,
    flags: number,
    protocolLevel: ProtocolLevel,
  ): UnsubackPacket;
} = {
  encode(packet: UnsubackPacket, _maximumPacketSize: number): Uint8Array {
    const flags = 0;
    const encoder = new Encoder(packet.type);
    encoder.setInt16(packet.id);
    return encoder.done(flags);
  },

  decode(
    buffer: Uint8Array,
    _flags: number,
    protocolLevel: ProtocolLevel,
  ): UnsubackPacket {
    if (protocolLevel === 5) {
      throw new DecoderError("Invalid protocol version");
    }
    const decoder = new Decoder(buffer);
    const id = decoder.getInt16();
    decoder.done();
    return {
      type: PacketType.unsuback,
      id,
    };
  },
};
