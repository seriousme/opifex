import { PacketType } from "./PacketType.ts";
import { hasEmptyFlags, isEmptyBuf } from "./decoder.ts";
import type { CodecOpts, TPacketType } from "./types.ts";

/**
 * PingreqPacket is a packet that is sent to the server to keep the connection alive
 */
export type PingreqPacket = {
  type: TPacketType;
};

const PINGRES_PACKET = new Uint8Array([PacketType.pingreq << 4, 0]);

export const pingreq: {
  encode(_packet: PingreqPacket, _codecOpts: CodecOpts): Uint8Array;
  decode(
    buffer: Uint8Array,
    flags: number,
    codecOpts: CodecOpts,
  ): PingreqPacket;
} = {
  encode(_packet: PingreqPacket, _codecOpts: CodecOpts): Uint8Array {
    return PINGRES_PACKET;
  },

  decode(
    buffer: Uint8Array,
    flags: number,
    _codecOpts: CodecOpts,
  ): PingreqPacket {
    hasEmptyFlags(flags);
    isEmptyBuf(buffer);
    return {
      type: PacketType.pingreq,
    };
  },
};
