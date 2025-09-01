import type {
  CodecOpts,
  PacketId,
  ProtocolLevelNoV5,
  ReturnCodes,
  TPacketType,
  TReasonCode,
} from "./types.ts";
import type { SubackProperties } from "./Properties.ts";
import { PacketType } from "./PacketType.ts";
import { Encoder } from "./encoder.ts";
import { Decoder, DecoderError } from "./decoder.ts";
const validReturnCodes = [0x00, 0x01, 0x02, 0x80];

/**
 * SubackPacket is sent by the server to the client to confirm receipt and
 * processing of a SubscribePacket.
 */
export type SubackPacketV4 = {
  type: TPacketType;
  protocolLevel: ProtocolLevelNoV5;
  id: PacketId;
  returnCodes: ReturnCodes;
};

export type SubackPacketV5 = {
  type: TPacketType;
  protocolLevel: 5;
  id: PacketId;
  properties: SubackProperties;
  reasonCodes: Array<TReasonCode>;
};

export type SubackPacket = SubackPacketV4 | SubackPacketV5;

export const suback: {
  encode(packet: SubackPacket, _codecOpts: CodecOpts): Uint8Array;
  decode(
    buffer: Uint8Array,
    flags: number,
    codecOpts: CodecOpts,
  ): SubackPacket;
} = {
  encode(packet: SubackPacket, codecOpts: CodecOpts): Uint8Array {
    const flags = 0;
    const encoder = new Encoder(packet.type);
    encoder.setInt16(packet.id);
    if (packet.protocolLevel !== 5) {
      for (const code of packet.returnCodes) {
        if (!validReturnCodes.includes(code)) {
          throw new Error("Invalid return code");
        }
      }
      encoder.setRemainder(packet.returnCodes);
      return encoder.done(flags);
    }
    encoder.setProperties(
      packet.properties || {},
      packet.type,
      codecOpts.maxOutgoingPacketSize,
    );
    for (const code of packet.reasonCodes) {
      encoder.setReasonCode(code);
    }
    return encoder.done(flags);
  },

  decode(
    buffer: Uint8Array,
    _flags: number,
    codecOpts: CodecOpts,
  ): SubackPacket {
    const packet = {} as SubackPacket;
    const decoder = new Decoder(buffer);
    packet.type = PacketType.suback;
    packet.id = decoder.getInt16();
    packet.protocolLevel = codecOpts.protocolLevel;

    if (packet.protocolLevel !== 5) {
      const payload = decoder.getRemainder();
      packet.returnCodes = [];
      for (const code of payload) {
        if (!validReturnCodes.includes(code)) {
          throw new DecoderError("Invalid return code");
        }
        packet.returnCodes.push(code);
      }
      return packet;
    }
    packet.properties = decoder.getProperties(PacketType.suback);
    packet.reasonCodes = [];
    while (!decoder.atEnd()) {
      const code = decoder.getReasonCode(PacketType.suback);
      packet.reasonCodes.push(code);
    }
    return packet;
  },
};
