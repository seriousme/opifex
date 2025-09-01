import type {
  CodecOpts,
  PacketId,
  ProtocolLevelNoV5,
  TPacketType,
  TReasonCode,
} from "./types.ts";
import type { UnsubackProperties } from "./Properties.ts";
import { PacketType } from "./PacketType.ts";
import { Decoder } from "./decoder.ts";
import { Encoder } from "./encoder.ts";

/**
 * UnsubackPacket is sent by the server to the client to confirm receipt
 * of an UnsubscribePacket.
 */
export type UnsubackPacketV4 = {
  type: TPacketType;
  protocolLevel: ProtocolLevelNoV5;
  id: PacketId;
};

export type UnsubackPacketV5 = {
  type: TPacketType;
  protocolLevel: 5;
  id: PacketId;
  properties: UnsubackProperties;
  reasonCodes: Array<TReasonCode>;
};

export type UnsubackPacket = UnsubackPacketV4 | UnsubackPacketV5;

export const unsuback: {
  encode(packet: UnsubackPacket, codecOpts: CodecOpts): Uint8Array;
  decode(
    buffer: Uint8Array,
    flags: number,
    codecOpts: CodecOpts,
    packetType: TPacketType,
  ): UnsubackPacket;
} = {
  encode(packet: UnsubackPacket, codecOpts: CodecOpts): Uint8Array {
    const flags = 0;
    const encoder = new Encoder(packet.type);
    encoder.setInt16(packet.id);
    if (packet.protocolLevel === 5) {
      encoder.setProperties(
        packet.properties || {},
        PacketType.unsuback,
        codecOpts.maxOutgoingPacketSize,
      );
      for (const reasonCode of packet.reasonCodes) {
        encoder.setByte(reasonCode);
      }
    }
    return encoder.done(flags);
  },

  decode(
    buffer: Uint8Array,
    _flags: number,
    codecOpts: CodecOpts,
    packetType: TPacketType
  ): UnsubackPacket {
    const decoder = new Decoder( packetType,buffer);
    const id = decoder.getInt16();
    if (codecOpts.protocolLevel === 5) {
      const properties = decoder.getProperties(PacketType.unsuback);
      const reasonCodes = [];
      while (!decoder.atEnd()) {
        const reasonCode = decoder.getReasonCode();
        reasonCodes.push(reasonCode);
      }
      return {
        type: PacketType.unsuback,
        protocolLevel: 5,
        id,
        properties,
        reasonCodes: reasonCodes as Array<TReasonCode>,
      };
    }
    decoder.done();
    return {
      type: PacketType.unsuback,
      protocolLevel: codecOpts.protocolLevel,
      id,
    };
  },
};
