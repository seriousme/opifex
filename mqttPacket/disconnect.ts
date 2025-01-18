import { PacketType } from "./PacketType.ts";
import { isEmptyBuf } from "./decoder.ts";
import type { TPacketType } from "./types.ts";

/**
 * Disconnect Packet is the final Control Packet sent from the Client to the Server.
 * It indicates that the Client is disconnecting cleanly.
 */
export type DisconnectPacket = {
  type: TPacketType;
};

export const disconnect: {
  encode(_packet: DisconnectPacket): { flags: number; bytes: number[] };
  decode(buffer: Uint8Array, _flags: number): DisconnectPacket;
} = {
  encode(_packet: DisconnectPacket): { flags: number; bytes: number[] } {
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
