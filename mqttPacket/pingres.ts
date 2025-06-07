import { PacketType } from "./PacketType.ts";
import { isEmptyBuf } from "./decoder.ts";
import type { ProtocolLevel, TPacketType } from "./types.ts";

/**
 * PingresPacket is  an empty packet that is sent by the server in response to a PingreqPacket.
 * It is used to indicate that the client is still connected to the server.
 */
export type PingresPacket = {
  type: TPacketType;
};

const PINGRES_PACKET = new Uint8Array([PacketType.pingres << 4,0]);

export const pingres: {
  encode(packet: PingresPacket): Uint8Array;
  decode(
    buffer: Uint8Array,
    _flags: number,
    protocolLevel: ProtocolLevel,
  ): PingresPacket;
} = {
  encode(_packet: PingresPacket): Uint8Array {
    return PINGRES_PACKET;
  },

  decode(
    buffer: Uint8Array,
    _flags: number,
    _protocolLevel: ProtocolLevel,
  ): PingresPacket {
    isEmptyBuf(buffer);
    return {
      type: PacketType.pingres,
    };
  },
};
