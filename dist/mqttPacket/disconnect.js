import { PacketType } from "./PacketType.js";
import { isEmptyBuf } from "./decoder.js";
export const disconnect = {
    encode(_packet) {
        const flags = 0;
        return { flags, bytes: [] };
    },
    decode(buffer, _flags) {
        isEmptyBuf(buffer);
        return {
            type: PacketType.disconnect,
        };
    },
};
