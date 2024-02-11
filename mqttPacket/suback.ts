import { PacketId, PacketType, ReturnCodes } from "./types.ts";
import { Encoder } from "./encoder.ts";
import { Decoder } from "./decoder.ts";

export type SubackPacket = {
  type: PacketType.suback;
  id: PacketId;
  returnCodes: ReturnCodes;
};

export default {
  encode(packet: SubackPacket) {
    const flags = 0;
    const encoder = new Encoder();
    encoder.setInt16(packet.id);
    encoder.setRemainder(packet.returnCodes);

    return {
      flags,
      bytes: encoder.done(),
    };
  },

  decode(buffer: Uint8Array): SubackPacket {
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
