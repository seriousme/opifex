import { PacketType } from "./PacketType.ts";
import { DecoderError, isEmptyBuf } from "./decoder.ts";
import type { CodecOpts, TPacketType } from "./types.ts";

/**
 * DisconnectPacket is the final control packet sent from the client to the server.
 * It indicates that the client is disconnecting cleanly.
 */
export type DisconnectPacket = {
  type: TPacketType;
};

const DISCONNECT_PACKET = new Uint8Array([PacketType.disconnect << 4, 0]);

export const disconnect: {
  encode(_packet: DisconnectPacket, _codecOpts: CodecOpts): Uint8Array;
  decode(
    buffer: Uint8Array,
    _flags: number,
    codecOpts: CodecOpts,
  ): DisconnectPacket;
} = {
  encode(_packet: DisconnectPacket, _codecOpts: CodecOpts): Uint8Array {
    return DISCONNECT_PACKET;
  },

  decode(buffer: Uint8Array, _flags: number, codecOpts): DisconnectPacket {
    if (codecOpts.protocolLevel === 5) {
      throw new DecoderError("Invalid protocol version");
    }
    isEmptyBuf(buffer);
    return {
      type: PacketType.disconnect,
    };
  },
};
