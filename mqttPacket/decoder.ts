import { BitMask, Topic, TopicFilter } from "./types.ts";
import { invalidTopic, invalidTopicFilter } from "./validators.ts";

const utf8Decoder = new TextDecoder("utf-8");

export function booleanFlag(byte: number, mask: BitMask): boolean {
	return !!(byte & mask);
}

export function isEmptyBuf(buf: Uint8Array): void {
	if (buf.length > 0) {
		throw new DecoderError("Packet too long");
	}
}

export function hasEmptyFlags(flags: number): void {
	if (flags !== 0) {
		throw new DecoderError("Invalid fixed header flags");
	}
}

export class DecoderError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DecoderError";
	}
}

export class Decoder {
	private buf: Uint8Array;
	private pos: number;
	private len: number;

	constructor(buf: Uint8Array, pos: number = 0) {
		this.buf = buf;
		this.pos = pos;
		this.len = buf.length;
	}
	checkpos(pos: number): void {
		if (pos > this.len) {
			throw new DecoderError("Packet too short");
		}
	}

	getByte(): number {
		this.checkpos(this.pos);
		return this.buf[this.pos++];
	}

	getInt16(): number {
		const msb = this.getByte();
		const lsb = this.getByte();
		return (msb << 8) | lsb;
	}

	getByteArray(): Uint8Array {
		const len = this.getInt16();
		const start = this.pos;
		const end = this.pos + len;
		this.pos = end;
		this.checkpos(end);
		return this.buf.subarray(start, end);
	}

	getUtf8String(): string {
		const str = utf8Decoder.decode(this.getByteArray());
		return str;
	}

	getTopic(): Topic {
		const topic = this.getUtf8String();
		if (invalidTopic(topic)) {
			throw new DecoderError(
				"Topic must contain valid UTF-8 and contain more than 1 byte and no wildcards",
			);
		}
		return topic;
	}

	getTopicFilter(): TopicFilter {
		const topicFilter = this.getUtf8String();
		if (invalidTopicFilter(topicFilter)) {
			throw new DecoderError(
				"Topicfilter must contain valid UTF-8 and contain more than 1 byte and valid wildcards",
			);
		}
		return topicFilter;
	}

	getRemainder() {
		const start = this.pos;
		const end = this.len;
		this.pos = end;
		return this.buf.subarray(start, end);
	}

	atEnd(): boolean {
		if (this.len === this.pos) {
			return true;
		}
		return false;
	}
	done(): boolean {
		if (this.atEnd()) {
			return true;
		}
		throw new DecoderError("Packet too long");
	}
}
