import type { CodecOpts, TAuthenticationResult, TPacketType } from "./types.ts";
import { PacketType } from "./PacketType.ts";
import { BitMask } from "./BitMask.ts";
import { booleanFlag, Decoder, DecoderError } from "./decoder.ts";
import { AuthenticationResultByNumber } from "./AuthenticationResult.ts";

/**
 * ConnackPacket is sent from the server to the client in response to a connect packet.
 * It indicates that the connect is accepted.
 */
export type ConnackPacket = {
  type: TPacketType;
  sessionPresent: boolean;
  returnCode: TAuthenticationResult;
};

export const connack: {
  encode(packet: ConnackPacket, _codecOpts: CodecOpts): Uint8Array;
  decode(
    buffer: Uint8Array,
    _flags: number,
    codecOpts: CodecOpts,
  ): ConnackPacket | undefined;
} = {
  encode(packet: ConnackPacket, _codecOpts: CodecOpts): Uint8Array {
    return new Uint8Array([
      packet.type << 4,
      2,
      packet.sessionPresent ? 1 : 0,
      packet.returnCode || 0,
    ]);
  },

  decode(
    buffer: Uint8Array,
    _flags: number,
    codecOpts: CodecOpts,
  ): ConnackPacket | undefined {
    const decoder = new Decoder(buffer);

    if (codecOpts.protocolLevel === 5) {
      throw new DecoderError("Invalid protocol version");
    }

    const sessionPresent = booleanFlag(decoder.getByte(), BitMask.bit0);
    const returnCode = decoder.getByte() as TAuthenticationResult;
    decoder.done();
    if (!AuthenticationResultByNumber[returnCode]) {
      throw new DecoderError("Invalid return code");
    }
    return {
      type: PacketType.connack,
      sessionPresent,
      returnCode,
    };
  },
};
