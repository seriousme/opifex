import { PacketType } from "./PacketType.ts";
import { isEmptyBuf } from "./decoder.ts";
import type { TPacketType } from "./types.ts";

export type PingresPacket = {
  type: TPacketType;
};

export default {
  encode(_packet: PingresPacket) {
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
