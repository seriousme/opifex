import { PacketType } from "./PacketType.ts";
import { Decoder, isEmptyBuf } from "./decoder.ts";
import type { CodecOpts, ProtocolLevelNoV5, TPacketType } from "./types.ts";
import type { DisconnectProperties } from "./Properties.ts";
import type { TReasonCode } from "./ReasonCode.ts";
import { Encoder } from "./encoder.ts";

/**
 * DisconnectPacket is the final control packet sent from the client to the server.
 * It indicates that the client is disconnecting cleanly.
 */
export type DisconnectPacketv4 = {
  type: TPacketType;
  protocolLevel: ProtocolLevelNoV5;
};

export type DisconnectPacketv5 = {
  type: TPacketType;
  protocolLevel: 5;
  reasonCode: number;
  properties?: DisconnectProperties;
};

export type DisconnectPacket = DisconnectPacketv4 | DisconnectPacketv5;

const DISCONNECT_PACKET = new Uint8Array([PacketType.disconnect << 4, 0]);

export const disconnect: {
  encode(_packet: DisconnectPacket, _codecOpts: CodecOpts): Uint8Array;
  decode(
    buffer: Uint8Array,
    _flags: number,
    codecOpts: CodecOpts,
  ): DisconnectPacket;
} = {
  encode(packet: DisconnectPacket, codecOpts: CodecOpts): Uint8Array {
    if (packet.protocolLevel !== 5) {
      return DISCONNECT_PACKET;
    }
    const reasonCode = packet.reasonCode || 0;
    const encoder = new Encoder(packet.type);
    // see MQTT v5 3.14.2.1
    // if remaining length is less than 1 the value of 0x00 (normal disconnect) is used.
    if (reasonCode === 0 && packet.properties === undefined) {
      return encoder.done(0);
    }
    encoder
      .setByte(reasonCode);
    if (packet.properties) {
      encoder.setProperties(
        packet.properties,
        packet.type,
        codecOpts.maxOutgoingPacketSize,
      );
    }
    return encoder.done(0);
  },

  decode(buffer: Uint8Array, _flags: number, codecOpts): DisconnectPacket {
    if (codecOpts.protocolLevel !== 5) {
      isEmptyBuf(buffer);
      return {
        type: PacketType.disconnect,
        protocolLevel: codecOpts.protocolLevel,
      };
    }
    const decoder = new Decoder(buffer);
    if (decoder.atEnd()) {
      return {
        type: PacketType.disconnect,
        protocolLevel: 5,
        reasonCode: 0,
      };
    }
    const reasonCode = decoder.getByte() as TReasonCode;
    const properties = decoder.getProperties(PacketType.connack);
    decoder.done();
    return {
      type: PacketType.disconnect,
      protocolLevel: 5,
      reasonCode,
      properties,
    };
  },
};
