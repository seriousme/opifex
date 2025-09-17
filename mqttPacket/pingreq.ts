import { PacketType } from "./PacketType.ts";
import { hasEmptyFlags, isEmptyBuf } from "./decoder.ts";
import type { ProtocolLevel, TPacketType } from "./types.ts";

/**
 * PingreqPacket is a packet that is sent to the server to keep the connection alive
 */
export type PingreqPacket = {
  type: TPacketType;
};

export const pingreq: {
  encode(_packet: PingreqPacket): { flags: number; bytes: number[] };
  decode(
    buffer: Uint8Array,
    flags: number,
    protocolLevel: ProtocolLevel,
  ): PingreqPacket;
} = {
  encode(_packet: PingreqPacket): { flags: number; bytes: number[] } {
    const flags = 0;
    return { flags, bytes: [] };
  },

  decode(
    buffer: Uint8Array,
    flags: number,
    _protocolLevel: ProtocolLevel,
  ): PingreqPacket {
    hasEmptyFlags(flags);
    isEmptyBuf(buffer);
    return {
      type: PacketType.pingreq,
    };
  },
};
