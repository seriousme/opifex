import { PacketType } from "./PacketType.ts";
import { isEmptyBuf } from "./decoder.ts";
import type { CodecOpts, ProtocolLevel, TPacketType } from "./types.ts";

/**
 * PingresPacket is  an empty packet that is sent by the server in response to a PingreqPacket.
 * It is used to indicate that the client is still connected to the server.
 */
export type PingresPacket = {
  type: TPacketType;
  protocolLevel: ProtocolLevel;
};

const PINGRES_PACKET = new Uint8Array([PacketType.pingres << 4, 0]);

export const pingres: {
  encode(packet: PingresPacket, _codecOpts: CodecOpts): Uint8Array;
  decode(
    buffer: Uint8Array,
    _flags: number,
    _codecOpts: CodecOpts,
  ): PingresPacket;
} = {
  encode(_packet: PingresPacket, _codecOpts: CodecOpts): Uint8Array {
    return PINGRES_PACKET;
  },

  decode(
    buffer: Uint8Array,
    _flags: number,
    codecOpts: CodecOpts,
  ): PingresPacket {
    isEmptyBuf(buffer);
    return {
      type: PacketType.pingres,
      protocolLevel: codecOpts.protocolLevel,
    };
  },
};
