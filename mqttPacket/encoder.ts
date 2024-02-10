const utf8Encoder = new TextEncoder();
import { Topic, TopicFilter } from "./types.ts";
import { invalidTopic, invalidTopicFilter } from "./validators.ts";

export class EncoderError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EncoderError";
	}
}

export class Encoder {
	private buffer: number[];

	constructor() {
		this.buffer = [];
	}

	setByte(value: number): this {
		this.buffer.push(value);
		return this;
	}

	setInt16(value: number): this {
		this.setByte(value >> 8);
		this.setByte(value & 0xff);
		return this;
	}

	setByteArray(value: Uint8Array): this {
		if (value.length > 0xffff) {
			throw new EncoderError("More than 0xffff bytes of data");
		}
		this.setInt16(value.length);
		this.buffer.push(...value);
		return this;
	}

	setUtf8String(value: string): this {
		this.setByteArray(utf8Encoder.encode(value));
		return this;
	}

	setTopic(value: Topic): this {
		if (invalidTopic(value)) {
			throw new EncoderError(
				"Topic must contain valid UTF-8 and contain more than 1 byte and no wildcards",
			);
		}
		this.setUtf8String(value);
		return this;
	}

	setTopicFilter(value: TopicFilter): this {
		if (invalidTopicFilter(value)) {
			throw new EncoderError(
				"Topicfilter must contain valid UTF-8 and contain more than 1 byte and valid wildcards",
			);
		}
		this.setUtf8String(value);
		return this;
	}

	setRemainder(value: Uint8Array | number[]): this {
		this.buffer.push(...value);
		return this;
	}

	done(): number[] {
		return this.buffer;
	}
}
