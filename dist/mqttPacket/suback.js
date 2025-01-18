import { PacketType } from "./PacketType.js";
import { Encoder } from "./encoder.js";
import { Decoder } from "./decoder.js";
export const suback = {
    encode(packet) {
        const flags = 0;
        const encoder = new Encoder();
        encoder.setInt16(packet.id);
        encoder.setRemainder(packet.returnCodes);
        return {
            flags,
            bytes: encoder.done(),
        };
    },
    decode(buffer) {
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
