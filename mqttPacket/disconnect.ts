import { PacketType } from "./PacketType.ts";
import { DecoderError, isEmptyBuf } from "./decoder.ts";
import type { ProtocolLevel, TPacketType } from "./types.ts";

/**
 * DisconnectPacket is the final control packet sent from the client to the server.
 * It indicates that the client is disconnecting cleanly.
 */
export type DisconnectPacket = {
  type: TPacketType;
};

export const disconnect: {
  encode(_packet: DisconnectPacket): { flags: number; bytes: number[] };
  decode(
    buffer: Uint8Array,
    _flags: number,
    protocolLevel: ProtocolLevel,
  ): DisconnectPacket;
} = {
  encode(_packet: DisconnectPacket): { flags: number; bytes: number[] } {
    const flags = 0;
    return { flags, bytes: [] };
  },

  decode(buffer: Uint8Array, _flags: number, protocolLevel): DisconnectPacket {
    if (protocolLevel === 5) {
      throw new DecoderError("Invalid protocol version");
    }
    isEmptyBuf(buffer);
    return {
      type: PacketType.disconnect,
    };
  },
};
