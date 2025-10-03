import type { CodecOpts, TPacketType } from "./types.ts";
import { PacketType } from "./PacketType.ts";
import { Encoder, EncoderError } from "./encoder.ts";
import { Decoder, DecoderError, hasEmptyFlags } from "./decoder.ts";
import type { TReasonCode } from "./ReasonCode.ts";
import type { AuthProperties } from "./Properties.ts";

// AuthPacket does not exist on protocol levels < 5
export type AuthPacketV5 = {
  type: TPacketType;
  protocolLevel: 5;
  reasonCode: TReasonCode;
  properties?: AuthProperties;
};

/**
 * An AUTH packet is sent from Client to Server or Server to Client as part of an extended
 * authentication exchange, such as challenge / response authentication.
 * It is a Protocol Error for the Client or Server to send an AUTH packet
 * if the CONNECT packet did not contain the same Authentication Method.
 */
export type AuthPacket = AuthPacketV5;

export const auth: {
  encode(packet: AuthPacket, codecOpts: CodecOpts): Uint8Array;
  decode(
    buffer: Uint8Array,
    flags: number,
    codecOpts: CodecOpts,
    packetType: TPacketType,
  ): AuthPacket;
} = {
  encode(packet: AuthPacket, codecOpts: CodecOpts): Uint8Array {
    if (packet.protocolLevel !== 5) {
      throw new EncoderError("Invalid protocol level");
    }
    const encoder = new Encoder(packet.type);
    encoder
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
  ): AuthPacket {
    // Bits 3,2,1 and 0 of the Fixed Header of the AUTH packet are reserved and MUST all be set to 0.
    // The Client or Server MUST treat any other value as malformed and close the Network Connection [MQTT-3.15.1-1].
    hasEmptyFlags(flags);
    if (codecOpts.protocolLevel !== 5) {
      throw new DecoderError("Invalid protocol level");
    }
    const decoder = new Decoder(packetType, buffer);
    const reasonCode = decoder.getReasonCode();
    const properties = decoder.getProperties(PacketType.auth);
    decoder.done();
    return {
      type: PacketType.auth,
      protocolLevel: 5,
      reasonCode,
      properties,
    };
  },
};
