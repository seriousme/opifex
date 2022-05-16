import { PacketType } from "./types.ts";
import { Decoder } from "./decoder.ts";
import { Encoder } from "./encoder.ts";

export type UnsubackPacket = {
  type: PacketType.unsuback;
  id: number;
};

export default {
  encode(packet: UnsubackPacket) {
    const flags = 0;
    const encoder = new Encoder();
    encoder.setInt16(packet.id);
    return { flags, bytes: encoder.done() };
  },

  decode(
    buffer: Uint8Array,
  ): UnsubackPacket {
    const decoder = new Decoder(buffer);
    const id = decoder.getInt16();
    decoder.done();
    return {
      type: PacketType.unsuback,
      id,
    };
  },
};
