import { BitMask, PacketType } from "./types.ts";
import { booleanFlag, Decoder, DecoderError } from "./decoder.ts";

export enum AuthenticationResult {
  ok = 0,
  unacceptableProtocol = 1,
  rejectedUsername = 2,
  serverUnavailable = 3,
  badUsernameOrPassword = 4,
  notAuthorized = 5,
}

export type ConnackPacket = {
  type: PacketType.connack;
  sessionPresent: boolean;
  returnCode: AuthenticationResult;
};

export default {
  encode(packet: ConnackPacket): { flags: number; bytes: number[] } {
    const flags = 0;
    return {
      flags,
      bytes: [
        packet.sessionPresent ? 1 : 0,
        packet.returnCode || 0,
      ],
    };
  },

  decode(
    buffer: Uint8Array,
    _flags: number,
  ): ConnackPacket | undefined {
    const decoder = new Decoder(buffer);

    const sessionPresent = booleanFlag(decoder.getByte(), BitMask.bit0);
    const returnCode = decoder.getByte();
    decoder.done();
    if (!AuthenticationResult[returnCode]) {
      throw new DecoderError("Invalid return code");
    }
    return {
      type: PacketType.connack,
      sessionPresent,
      returnCode,
    };
  },
};
