import { PacketNameByType, PacketType } from "./PacketType.js";
import { invalidTopic, invalidTopicFilter, invalidUTF8 } from "./validators.js";
import { decodeLength, encodeLength } from "./length.js";
import { connect } from "./connect.js";
import { connack } from "./connack.js";
import { AuthenticationResult, AuthenticationResultByNumber, } from "./AuthenticationResult.js";
import { publish } from "./publish.js";
import { puback } from "./puback.js";
import { pubrec } from "./pubrec.js";
import { pubrel } from "./pubrel.js";
import { pubcomp } from "./pubcomp.js";
import { subscribe } from "./subscribe.js";
import { suback } from "./suback.js";
import { unsubscribe } from "./unsubscribe.js";
import { unsuback } from "./unsuback.js";
import { pingreq } from "./pingreq.js";
import { pingres } from "./pingres.js";
import { disconnect } from "./disconnect.js";
import { DecoderError } from "./decoder.js";
export { AuthenticationResult, AuthenticationResultByNumber, decodeLength, encodeLength, invalidTopic, invalidTopicFilter, invalidUTF8, PacketNameByType, PacketType, };
export const packetsByType = [
    null,
    connect, // 1
    connack, // 2
    publish, // 3
    puback, // 4
    pubrec, // 5
    pubrel, // 6
    pubcomp, // 7
    subscribe, // 8
    suback, // 9
    unsubscribe, // 10
    unsuback, // 11
    pingreq, // 12
    pingres, // 13
    disconnect, // 14
];
export function encode(packet) {
    const packetType = packet.type;
    // deno-lint-ignore no-explicit-any
    const pkt = packet;
    const encoded = packetsByType[packetType]?.encode(pkt);
    if (!encoded) {
        throw Error("Packet encoding failed");
    }
    const { flags, bytes } = encoded;
    return Uint8Array.from([
        (packetType << 4) | flags,
        ...encodeLength(bytes.length),
        ...bytes,
    ]);
}
export function decodePayload(firstByte, buffer) {
    const packetType = firstByte >> 4;
    const flags = firstByte & 0x0f;
    const packet = packetsByType[packetType]?.decode(buffer, flags);
    if (packet !== undefined) {
        return packet;
    }
    throw new Error("packet decoding failed");
}
export function decode(buffer) {
    if (buffer.length < 2) {
        throw new DecoderError("Packet decoding failed");
    }
    const { length, numLengthBytes } = decodeLength(buffer, 1);
    const start = numLengthBytes + 1;
    const end = start + length;
    return decodePayload(buffer[0], buffer.subarray(start, end));
}
export { getLengthDecoder } from "../mqttPacket/length.js";
