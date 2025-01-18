import type { PacketId, TPacketType } from "./types.ts";
import { PacketType } from "./PacketType.ts";
import { Decoder } from "./decoder.ts";
import { Encoder } from "./encoder.ts";

/**
 * Unsuback Packet is sent by the Server to the Client to confirm receipt
 * of an Unsubscribe Packet.
 */
export type UnsubackPacket = {
  type: TPacketType;
  id: PacketId;
};

export const unsuback: {
  encode(packet: UnsubackPacket): { flags: number; bytes: number[] };
  decode(buffer: Uint8Array): UnsubackPacket;
} = {
  encode(packet: UnsubackPacket): { flags: number; bytes: number[] } {
    const flags = 0;
    const encoder = new Encoder();
    encoder.setInt16(packet.id);
    return { flags, bytes: encoder.done() };
  },

  decode(buffer: Uint8Array): UnsubackPacket {
    const decoder = new Decoder(buffer);
    const id = decoder.getInt16();
    decoder.done();
    return {
      type: PacketType.unsuback,
      id,
    };
  },
};
