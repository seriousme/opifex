import type { PacketId, TPacketType } from "./types.ts";
import { PacketType } from "./PacketType.ts";
import { Decoder } from "./decoder.ts";
import { Encoder } from "./encoder.ts";

export type PubrecPacket = {
  type: TPacketType;
  id: PacketId;
};

export default {
  encode(packet: PubrecPacket) {
    const flags = 0;
    const encoder = new Encoder();
    encoder.setInt16(packet.id);
    return { flags, bytes: encoder.done() };
  },

  decode(buffer: Uint8Array): PubrecPacket {
    const decoder = new Decoder(buffer);
    const id = decoder.getInt16();
    decoder.done();
    return {
      type: PacketType.pubrec,
      id,
    };
  },
};
