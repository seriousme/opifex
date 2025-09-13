import type {
  CodecOpts,
  ProtocolLevelNoV5,
  TAuthenticationResult,
  TPacketType,
} from "./types.ts";
import { PacketType } from "./PacketType.ts";
import { BitMask } from "./BitMask.ts";
import { Encoder } from "./encoder.ts";
import { booleanFlag, Decoder, DecoderError } from "./decoder.ts";
import { AuthenticationResultByNumber } from "./AuthenticationResult.ts";
import type { TReasonCode } from "./ReasonCode.ts";
import type { ConnackProperties } from "./Properties.ts";

/**
 * ConnackPacket is sent from the server to the client in response to a connect packet.
 * It indicates that the connect is accepted.
 */
export type ConnackPacketV4 = {
  type: TPacketType;
  protocolLevel: ProtocolLevelNoV5;
  sessionPresent: boolean;
  returnCode: TAuthenticationResult;
};

export type ConnackPacketV5 = {
  type: TPacketType;
  protocolLevel: 5;
  sessionPresent: boolean;
  reasonCode: TReasonCode;
  properties?: ConnackProperties;
};

export type ConnackPacket = ConnackPacketV4 | ConnackPacketV5;

export const connack: {
  encode(packet: ConnackPacket, codecOpts: CodecOpts): Uint8Array;
  decode(
    buffer: Uint8Array,
    flags: number,
    codecOpts: CodecOpts,
    packetType: TPacketType,
  ): ConnackPacket;
} = {
  encode(packet: ConnackPacket, codecOpts: CodecOpts): Uint8Array {
    if (packet.protocolLevel !== 5) {
      return new Uint8Array([
        packet.type << 4,
        2,
        packet.sessionPresent ? 1 : 0,
        packet.returnCode || 0,
      ]);
    }
    const encoder = new Encoder(packet.type);
    encoder
      .setByte(packet.sessionPresent ? 1 : 0)
      .setReasonCode(packet.reasonCode || 0)
      .setProperties(
        packet.properties || {},
        packet.type,
        codecOpts.maxOutgoingPacketSize,
      );
    return encoder.done(0);
  },

  decode(
    buffer: Uint8Array,
    flags: number,
    codecOpts: CodecOpts,
    packetType: TPacketType,
  ): ConnackPacket {
    const decoder = new Decoder(packetType, buffer);
    if (flags !== 0) {
      throw new DecoderError("Invalid header flags");
    }
    const ackflags = decoder.getByte();
    if (ackflags > 1) {
      throw new DecoderError("Invalid Connect Acknowledge flags");
    }
    const sessionPresent = booleanFlag(ackflags, BitMask.bit0);
    if (codecOpts.protocolLevel !== 5) {
      const returnCode = decoder.getByte() as TAuthenticationResult;
      decoder.done();
      if (!AuthenticationResultByNumber[returnCode]) {
        throw new DecoderError("Invalid return code");
      }
      return {
        type: PacketType.connack,
        protocolLevel: codecOpts.protocolLevel,
        sessionPresent,
        returnCode,
      };
    }
    const reasonCode = decoder.getReasonCode();
    const properties = decoder.getProperties(PacketType.connack);
    decoder.done();
    return {
      type: PacketType.connack,
      protocolLevel: 5,
      sessionPresent,
      reasonCode,
      properties,
    };
  },
};
