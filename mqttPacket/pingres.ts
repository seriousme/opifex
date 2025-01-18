import { PacketType } from "./PacketType.ts";
import { isEmptyBuf } from "./decoder.ts";
import type { TPacketType } from "./types.ts";

export type PingresPacket = {
  type: TPacketType;
};

export const pingres: {
  encode(_packet: PingresPacket): { flags: number; bytes: number[] };
  decode(buffer: Uint8Array): PingresPacket;
} = {
  encode(_packet: PingresPacket): { flags: number; bytes: number[] } {
    const flags = 0;
    return { flags, bytes: [] };
  },

  decode(buffer: Uint8Array): PingresPacket {
    isEmptyBuf(buffer);
    return {
      type: PacketType.pingres,
    };
  },
};
