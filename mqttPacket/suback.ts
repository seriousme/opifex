import type {
  PacketId,
  ProtocolLevel,
  ReturnCodes,
  TPacketType,
} from "./types.ts";
import { PacketType } from "./PacketType.ts";
import { Encoder } from "./encoder.ts";
import { Decoder, DecoderError } from "./decoder.ts";

/**
 * SubackPacket is sent by the server to the client to confirm receipt and
 * processing of a SubscribePacket.
 */
export type SubackPacket = {
  type: TPacketType;
  id: PacketId;
  returnCodes: ReturnCodes;
};

export const suback: {
  encode(packet: SubackPacket): { flags: number; bytes: number[] };
  decode(
    buffer: Uint8Array,
    flags: number,
    protocolLevel: ProtocolLevel,
  ): SubackPacket;
} = {
  encode(packet: SubackPacket): { flags: number; bytes: number[] } {
    const flags = 0;
    const encoder = new Encoder();
    encoder.setInt16(packet.id);
    encoder.setRemainder(packet.returnCodes);

    return {
      flags,
      bytes: encoder.done(),
    };
  },

  decode(
    buffer: Uint8Array,
    _flags: number,
    protocolLevel: ProtocolLevel,
  ): SubackPacket {
    if (protocolLevel === 5) {
      throw new DecoderError("Invalid protocol version");
    }
    const decoder = new Decoder(buffer);
    const id = decoder.getInt16();
    const payload = decoder.getRemainder();
    const returnCodes = [];

    for (const code of payload) {
      returnCodes.push(code);
    }

    return {
      type: PacketType.suback,
      id,
      returnCodes,
    };
  },
};
