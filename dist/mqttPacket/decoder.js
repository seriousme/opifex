import { invalidTopic, invalidTopicFilter } from "./validators.js";
const utf8Decoder = new TextDecoder("utf-8");
export function booleanFlag(byte, mask) {
    return !!(byte & mask);
}
export function isEmptyBuf(buf) {
    if (buf.length > 0) {
        throw new DecoderError("Packet too long");
    }
}
export function hasEmptyFlags(flags) {
    if (flags !== 0) {
        throw new DecoderError("Invalid fixed header flags");
    }
}
export class DecoderError extends Error {
    constructor(message) {
        super(message);
        this.name = "DecoderError";
    }
}
export class Decoder {
    buf;
    pos;
    len;
    constructor(buf, pos = 0) {
        this.buf = buf;
        this.pos = pos;
        this.len = buf.length;
    }
    checkpos(pos) {
        if (pos > this.len) {
            throw new DecoderError("Packet too short");
        }
    }
    getByte() {
        this.checkpos(this.pos);
        return this.buf[this.pos++];
    }
    getInt16() {
        const msb = this.getByte();
        const lsb = this.getByte();
        return (msb << 8) | lsb;
    }
    getByteArray() {
        const len = this.getInt16();
        const start = this.pos;
        const end = this.pos + len;
        this.pos = end;
        this.checkpos(end);
        return this.buf.subarray(start, end);
    }
    getUtf8String() {
        const str = utf8Decoder.decode(this.getByteArray());
        return str;
    }
    getTopic() {
        const topic = this.getUtf8String();
        if (invalidTopic(topic)) {
            throw new DecoderError("Topic must contain valid UTF-8 and contain more than 1 byte and no wildcards");
        }
        return topic;
    }
    getTopicFilter() {
        const topicFilter = this.getUtf8String();
        if (invalidTopicFilter(topicFilter)) {
            throw new DecoderError("Topicfilter must contain valid UTF-8 and contain more than 1 byte and valid wildcards");
        }
        return topicFilter;
    }
    getRemainder() {
        const start = this.pos;
        const end = this.len;
        this.pos = end;
        return this.buf.subarray(start, end);
    }
    atEnd() {
        if (this.len === this.pos) {
            return true;
        }
        return false;
    }
    done() {
        if (this.atEnd()) {
            return true;
        }
        throw new DecoderError("Packet too long");
    }
}
