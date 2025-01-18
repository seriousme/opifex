import type { PacketId, TPacketType } from "./types.ts";
import { PacketType } from "./PacketType.ts";
import { Decoder } from "./decoder.ts";
import { Encoder } from "./encoder.ts";

/**
 * PubackPacket is sent to indicate publish complete (QoS 1)
 */
export type PubackPacket = {
  type: TPacketType;
  id: PacketId;
};

export const puback: {
  encode(packet: PubackPacket): { flags: number; bytes: number[] };
  decode(buffer: Uint8Array): PubackPacket;
} = {
  encode(packet: PubackPacket): { flags: number; bytes: number[] } {
    const flags = 0;
    const encoder = new Encoder();
    encoder.setInt16(packet.id);
    return { flags, bytes: encoder.done() };
  },

  decode(buffer: Uint8Array): PubackPacket {
    const decoder = new Decoder(buffer);
    const id = decoder.getInt16();
    decoder.done();
    return {
      type: PacketType.puback,
      id,
    };
  },
};
