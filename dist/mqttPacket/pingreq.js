import { PacketType } from "./PacketType.js";
import { hasEmptyFlags, isEmptyBuf } from "./decoder.js";
export const pingreq = {
    encode(_packet) {
        const flags = 0;
        return { flags, bytes: [] };
    },
    decode(buffer, flags) {
        hasEmptyFlags(flags);
        isEmptyBuf(buffer);
        return {
            type: PacketType.pingreq,
        };
    },
};
