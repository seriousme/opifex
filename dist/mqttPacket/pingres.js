import { PacketType } from "./PacketType.js";
import { isEmptyBuf } from "./decoder.js";
export const pingres = {
    encode(_packet) {
        const flags = 0;
        return { flags, bytes: [] };
    },
    decode(buffer) {
        isEmptyBuf(buffer);
        return {
            type: PacketType.pingres,
        };
    },
};
