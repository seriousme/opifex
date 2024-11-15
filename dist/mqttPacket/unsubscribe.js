import { PacketType } from "./PacketType.js";
import { BitMask } from "./BitMask.js";
import { Encoder } from "./encoder.js";
import { booleanFlag, Decoder, DecoderError } from "./decoder.js";
export default {
    encode(packet) {
        // Bits 3,2,1 and 0 of the fixed header of the UNSUBSCRIBE Control Packet are reserved and
        // MUST be set to 0,0,1 and 0 respectively. The Server MUST treat any other value as
        // malformed and close the Network Connection [MQTT-3.10.1-1].
        const flags = 0b0010;
        const encoder = new Encoder();
        encoder.setInt16(packet.id);
        for (const topicFilter of packet.topicFilters) {
            encoder.setTopicFilter(topicFilter);
        }
        return { flags, bytes: encoder.done() };
    },
    decode(buffer, flags) {
        if (!booleanFlag(flags, BitMask.bit1)) {
            throw new DecoderError("Invalid header");
        }
        const decoder = new Decoder(buffer);
        const id = decoder.getInt16();
        const topicFilters = [];
        do {
            const topicFilter = decoder.getTopicFilter();
            topicFilters.push(topicFilter);
        } while (!decoder.atEnd());
        decoder.done();
        return {
            type: PacketType.unsubscribe,
            id,
            topicFilters,
        };
    },
};
