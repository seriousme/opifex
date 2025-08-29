import type {
  CodecOpts,
  PacketId,
  ProtocolLevelNoV5,
  ReturnCodes,
  TPacketType,
} from "./types.ts";
import type { SubackProperties } from "./Properties.ts";
import { PacketType } from "./PacketType.ts";
import { Encoder } from "./encoder.ts";
import { Decoder } from "./decoder.ts";

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
  returnCodes: ReturnCodes;
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
    if (packet.protocolLevel === 5) {
      encoder.setProperties(
        packet.properties || {},
        packet.type,
        codecOpts.maxOutgoingPacketSize,
      );
    }
    encoder.setRemainder(packet.returnCodes);
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
    if (packet.protocolLevel === 5) {
      packet.properties = decoder.getProperties(PacketType.suback);
    }
    const payload = decoder.getRemainder();
    packet.returnCodes = [];
    for (const code of payload) {
      packet.returnCodes.push(code);
    }
    return packet;
  },
};
