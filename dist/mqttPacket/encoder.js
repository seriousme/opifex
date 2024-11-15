const utf8Encoder = new TextEncoder();
import { invalidTopic, invalidTopicFilter } from "./validators.js";
export class EncoderError extends Error {
    constructor(message) {
        super(message);
        this.name = "EncoderError";
    }
}
export class Encoder {
    buffer;
    constructor() {
        this.buffer = [];
    }
    setByte(value) {
        this.buffer.push(value);
        return this;
    }
    setInt16(value) {
        this.setByte(value >> 8);
        this.setByte(value & 0xff);
        return this;
    }
    setByteArray(value) {
        if (value.length > 0xffff) {
            throw new EncoderError("More than 0xffff bytes of data");
        }
        this.setInt16(value.length);
        this.buffer.push(...value);
        return this;
    }
    setUtf8String(value) {
        this.setByteArray(utf8Encoder.encode(value));
        return this;
    }
    setTopic(value) {
        if (invalidTopic(value)) {
            throw new EncoderError("Topic must contain valid UTF-8 and contain more than 1 byte and no wildcards");
        }
        this.setUtf8String(value);
        return this;
    }
    setTopicFilter(value) {
        if (invalidTopicFilter(value)) {
            throw new EncoderError("Topicfilter must contain valid UTF-8 and contain more than 1 byte and valid wildcards");
        }
        this.setUtf8String(value);
        return this;
    }
    setRemainder(value) {
        this.buffer.push(...value);
        return this;
    }
    done() {
        return this.buffer;
    }
}
