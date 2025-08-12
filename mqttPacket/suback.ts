import type { CodecOpts, PacketId, ReturnCodes, TPacketType } from "./types.ts";
import { PacketType } from "./PacketType.ts";
import { Encoder } from "./encoder.ts";
import { Decoder, DecoderError } from "./decoder.ts";

/**
 * SubackPacket is sent by the server to the client to confirm receipt and
 * processing of a SubscribePacket.
 */
export type SubackPacket = {
  type: TPacketType;
  id: PacketId;
  returnCodes: ReturnCodes;
};

export const suback: {
  encode(packet: SubackPacket, _codecOpts: CodecOpts): Uint8Array;
  decode(
    buffer: Uint8Array,
    flags: number,
    codecOpts: CodecOpts,
  ): SubackPacket;
} = {
  encode(packet: SubackPacket, _codecOpts: CodecOpts): Uint8Array {
    const flags = 0;
    const encoder = new Encoder(packet.type);
    encoder.setInt16(packet.id);
    encoder.setRemainder(packet.returnCodes);

    return encoder.done(flags);
  },

  decode(
    buffer: Uint8Array,
    _flags: number,
    codecOpts: CodecOpts,
  ): SubackPacket {
    if (codecOpts.protocolLevel === 5) {
      throw new DecoderError("Invalid protocol version");
    }
    const decoder = new Decoder(buffer);
    const id = decoder.getInt16();
    const payload = decoder.getRemainder();
    const returnCodes = [];

    for (const code of payload) {
      returnCodes.push(code);
    }

    return {
      type: PacketType.suback,
      id,
      returnCodes,
    };
  },
};
