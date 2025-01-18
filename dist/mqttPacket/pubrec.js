import { PacketType } from "./PacketType.js";
import { Decoder } from "./decoder.js";
import { Encoder } from "./encoder.js";
export const pubrec = {
    encode(packet) {
        const flags = 0;
        const encoder = new Encoder();
        encoder.setInt16(packet.id);
        return { flags, bytes: encoder.done() };
    },
    decode(buffer) {
        const decoder = new Decoder(buffer);
        const id = decoder.getInt16();
        decoder.done();
        return {
            type: PacketType.pubrec,
            id,
        };
    },
};
