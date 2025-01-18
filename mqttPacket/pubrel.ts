import type { PacketId, TPacketType } from "./types.ts";
import { PacketType } from "./PacketType.ts";
import { Decoder } from "./decoder.ts";
import { Encoder } from "./encoder.ts";

export type PubrelPacket = {
  type: TPacketType;
  id: PacketId;
};

export const pubrel: {
  encode(packet: PubrelPacket): { flags: number; bytes: number[] };
  decode(buffer: Uint8Array): PubrelPacket;
} = {
  encode(packet: PubrelPacket): { flags: number; bytes: number[] } {
    const flags = 0;
    const encoder = new Encoder();
    encoder.setInt16(packet.id);
    return { flags, bytes: encoder.done() };
  },

  decode(buffer: Uint8Array): PubrelPacket {
    const decoder = new Decoder(buffer);
    const id = decoder.getInt16();
    decoder.done();
    return {
      type: PacketType.pubrel,
      id,
    };
  },
};
