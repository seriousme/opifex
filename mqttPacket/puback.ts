import type { CodecOpts, PacketId, TPacketType } from "./types.ts";
import { PacketType } from "./PacketType.ts";
import { Decoder, DecoderError } from "./decoder.ts";
import { Encoder } from "./encoder.ts";

/**
 * PubackPacket is sent to indicate publish complete (QoS 1)
 */
export type PubackPacket = {
  type: TPacketType;
  id: PacketId;
};

export const puback: {
  encode(packet: PubackPacket, _codecOpts: CodecOpts): Uint8Array;
  decode(
    buffer: Uint8Array,
    _flags: number,
    codecOpts: CodecOpts,
  ): PubackPacket;
} = {
  encode(packet: PubackPacket, _codecOpts: CodecOpts): Uint8Array {
    const flags = 0;
    const encoder = new Encoder(packet.type);
    encoder.setInt16(packet.id);
    return encoder.done(flags);
  },

  decode(
    buffer: Uint8Array,
    _flags: number,
    codecOpts: CodecOpts,
  ): PubackPacket {
    if (codecOpts.protocolLevel === 5) {
      throw new DecoderError("Invalid protocol version");
    }
    const decoder = new Decoder(buffer);
    const id = decoder.getInt16();
    decoder.done();
    return {
      type: PacketType.puback,
      id,
    };
  },
};
