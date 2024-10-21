import { PacketType } from "./PacketType.ts";
import { hasEmptyFlags, isEmptyBuf } from "./decoder.ts";
import type { TPacketType } from "./types.ts";

export type PingreqPacket = {
  type: TPacketType;
};

export default {
  encode(_packet: PingreqPacket) {
    const flags = 0;
    return { flags, bytes: [] };
  },

  decode(buffer: Uint8Array, flags: number): PingreqPacket {
    hasEmptyFlags(flags);
    isEmptyBuf(buffer);
    return {
      type: PacketType.pingreq,
    };
  },
};
