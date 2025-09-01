import { PacketType } from "./PacketType.ts";
import { hasEmptyFlags, isEmptyBuf } from "./decoder.ts";
import type { CodecOpts, ProtocolLevel, TPacketType } from "./types.ts";

/**
 * PingreqPacket is a packet that is sent to the server to keep the connection alive
 */
export type PingreqPacket = {
  type: TPacketType;
  protocolLevel: ProtocolLevel;
};

const PINGRES_PACKET = new Uint8Array([PacketType.pingreq << 4, 0]);

export const pingreq: {
  encode(_packet: PingreqPacket, _codecOpts: CodecOpts): Uint8Array;
  decode(
    buffer: Uint8Array,
    flags: number,
    codecOpts: CodecOpts,
    _packetType: TPacketType,
  ): PingreqPacket;
} = {
  encode(_packet: PingreqPacket, _codecOpts: CodecOpts): Uint8Array {
    return PINGRES_PACKET;
  },

  decode(
    buffer: Uint8Array,
    flags: number,
    codecOpts: CodecOpts,
    _packetType: TPacketType,
  ): PingreqPacket {
    hasEmptyFlags(flags);
    isEmptyBuf(buffer);
    return {
      type: PacketType.pingreq,
      protocolLevel: codecOpts.protocolLevel,
    };
  },
};
