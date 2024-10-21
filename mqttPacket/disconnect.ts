import { PacketType } from "./PacketType.ts";
import { isEmptyBuf } from "./decoder.ts";
import type { TPacketType } from "./types.ts";

export type DisconnectPacket = {
  type: TPacketType;
};

export default {
  encode(_packet: DisconnectPacket) {
    const flags = 0;
    return { flags, bytes: [] };
  },

  decode(buffer: Uint8Array, _flags: number): DisconnectPacket {
    isEmptyBuf(buffer);
    return {
      type: PacketType.disconnect,
    };
  },
};
