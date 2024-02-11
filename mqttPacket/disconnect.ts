import { PacketType } from "./types.ts";
import { isEmptyBuf } from "./decoder.ts";

export type DisconnectPacket = {
  type: PacketType.disconnect;
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
