import type { TAuthenticationResult, TPacketType } from "./types.ts";
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
  encode(packet: ConnackPacket): { flags: number; bytes: number[] };
  decode(buffer: Uint8Array, _flags: number): ConnackPacket | undefined;
} = {
  encode(packet: ConnackPacket): { flags: number; bytes: number[] } {
    const flags = 0;
    return {
      flags,
      bytes: [packet.sessionPresent ? 1 : 0, packet.returnCode || 0],
    };
  },

  decode(buffer: Uint8Array, _flags: number): ConnackPacket | undefined {
    const decoder = new Decoder(buffer);

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
