import { PacketType } from "./types.ts";
import { assertEquals, assertThrows } from "./dev_deps.ts";
import { decode, encode } from "./mod.ts";

Deno.test("encode Pubrel", () => {
	assertEquals(
		encode({
			type: PacketType.pubrel,
			id: 1337,
		}),
		Uint8Array.from([
			// fixedHeader
			0x60, // packetType + flags
			2, // remainingLength
			// variableHeader
			5, // id MSB
			57, // id LSB
		]),
	);
});

Deno.test("decode Pubrel ", () => {
	assertEquals(
		decode(
			Uint8Array.from([
				// fixedHeader
				0x60, // packetType + flags
				2, // remainingLength
				// variableHeader
				5, // id MSB
				57, // id LSB
			]),
		),
		{
			type: PacketType.pubrel,
			id: 1337,
		},
	);
});

Deno.test("decodeShortPubrelPackets", () => {
	assertThrows(() => decode(Uint8Array.from([0x60])), Error, "decoding failed");
	assertThrows(() => decode(Uint8Array.from([0x60, 2])), Error, "too short");
	assertThrows(
		() => decode(Uint8Array.from([0x60, 3, 0, 0, 0])),
		Error,
		"too long",
	);
});
