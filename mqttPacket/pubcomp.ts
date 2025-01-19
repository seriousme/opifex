import type { PacketId, TPacketType } from "./types.ts";
import { PacketType } from "./PacketType.ts";
import { Decoder } from "./decoder.ts";
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
  encode(packet: PubcompPacket): { flags: number; bytes: number[] };
  decode(buffer: Uint8Array): PubcompPacket;
} = {
  encode(packet: PubcompPacket): { flags: number; bytes: number[] } {
    const flags = 0;
    const encoder = new Encoder();
    encoder.setInt16(packet.id);
    return { flags, bytes: encoder.done() };
  },

  decode(buffer: Uint8Array): PubcompPacket {
    const decoder = new Decoder(buffer);
    const id = decoder.getInt16();
    decoder.done();
    return {
      type: PacketType.pubcomp,
      id,
    };
  },
};
