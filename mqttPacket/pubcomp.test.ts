import { PacketType } from "./types.ts";
import { assertEquals, assertThrows } from "./dev_deps.ts";
import { decode, encode } from "./mod.ts";

Deno.test("encode Pubcomp", () => {
	assertEquals(
		encode({
			type: PacketType.pubcomp,
			id: 1337,
		}),
		Uint8Array.from([
			// fixedHeader
			0x70, // packetType + flags
			2, // remainingLength
			// variableHeader
			5, // id MSB
			57, // id LSB
		]),
	);
});

Deno.test("decode Pubcomp ", () => {
	assertEquals(
		decode(
			Uint8Array.from([
				// fixedHeader
				0x70, // packetType + flags
				2, // remainingLength
				// variableHeader
				5, // id MSB
				57, // id LSB
			]),
		),
		{
			type: PacketType.pubcomp,
			id: 1337,
		},
	);
});

Deno.test("decodeShortPubcompPackets", () => {
	assertThrows(() => decode(Uint8Array.from([0x70])), Error, "decoding failed");
	assertThrows(() => decode(Uint8Array.from([0x70, 2])), Error, "too short");
	assertThrows(
		() => decode(Uint8Array.from([0x70, 3, 0, 0, 0])),
		Error,
		"too long",
	);
});
