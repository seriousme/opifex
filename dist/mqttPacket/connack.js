import { PacketType } from "./PacketType.js";
import { BitMask } from "./BitMask.js";
import { booleanFlag, Decoder, DecoderError } from "./decoder.js";
import { AuthenticationResultByNumber } from "./AuthenticationResult.js";
export const connack = {
    encode(packet) {
        const flags = 0;
        return {
            flags,
            bytes: [packet.sessionPresent ? 1 : 0, packet.returnCode || 0],
        };
    },
    decode(buffer, _flags) {
        const decoder = new Decoder(buffer);
        const sessionPresent = booleanFlag(decoder.getByte(), BitMask.bit0);
        const returnCode = decoder.getByte();
        decoder.done();
        if (!AuthenticationResultByNumber[returnCode]) {
            throw new DecoderError("Invalid return code");
        }
        return {
            type: PacketType.connack,
            sessionPresent,
            returnCode,
        };
    },
};
