import { PacketType } from "./types.ts";
import { isEmptyBuf } from "./decoder.ts";

export interface PingresPacket {
  type: PacketType.pingres;
}

export default {
  encode(_packet: PingresPacket) {
    const flags = 0;
    return { flags, bytes:[]};
  },

  decode(
    buffer: Uint8Array,
  ): PingresPacket {
    isEmptyBuf(buffer);
    return {
      type: PacketType.pingres,
    };
  },
};
