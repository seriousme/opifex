import { PacketType } from "./types.ts";
import { hasEmptyFlags, isEmptyBuf } from "./decoder.ts";

export type PingreqPacket = {
	type: PacketType.pingreq;
};

export default {
	encode(_packet: PingreqPacket) {
		const flags = 0;
		return { flags, bytes: [] };
	},

	decode(buffer: Uint8Array, flags: number): PingreqPacket {
		hasEmptyFlags(flags);
		isEmptyBuf(buffer);
		return {
			type: PacketType.pingreq,
		};
	},
};
