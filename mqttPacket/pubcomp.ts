import { PacketId, PacketType } from "./types.ts";
import { Decoder } from "./decoder.ts";
import { Encoder } from "./encoder.ts";

export type PubcompPacket = {
	type: PacketType.pubcomp;
	id: PacketId;
};

export default {
	encode(packet: PubcompPacket) {
		const flags = 0;
		const encoder = new Encoder();
		encoder.setInt16(packet.id);
		return { flags, bytes: encoder.done() };
	},

	decode(buffer: Uint8Array): PubcompPacket {
		const decoder = new Decoder(buffer);
		const id = decoder.getInt16();
		decoder.done();
		return {
			type: PacketType.pubcomp,
			id,
		};
	},
};
