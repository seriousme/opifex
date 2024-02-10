import { PacketType } from "./types.ts";
import { assertEquals, assertThrows } from "./dev_deps.ts";
import { decode, encode } from "./mod.ts";

Deno.test("encode Puback", () => {
	assertEquals(
		encode({
			type: PacketType.unsuback,
			id: 1337,
		}),
		Uint8Array.from([
			// fixedHeader
			0xb0, // packetType + flags
			2, // remainingLength
			// variableHeader
			5, // id MSB
			57, // id LSB
		]),
	);
});

Deno.test("decode Puback ", () => {
	assertEquals(
		decode(
			Uint8Array.from([
				// fixedHeader
				0xb0, // packetType + flags
				2, // remainingLength
				// variableHeader
				5, // id MSB
				57, // id LSB
			]),
		),
		{
			type: PacketType.unsuback,
			id: 1337,
		},
	);
});

Deno.test("decodeShortPubackPackets", () => {
	assertThrows(() => decode(Uint8Array.from([0xb0])), Error, "decoding failed");
	assertThrows(() => decode(Uint8Array.from([0xb0, 2])), Error, "too short");
	assertThrows(
		() => decode(Uint8Array.from([0xb0, 3, 0, 0, 0])),
		Error,
		"too long",
	);
});
