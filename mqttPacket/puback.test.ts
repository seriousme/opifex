import { PacketType } from "./types.ts";
import { assertEquals, assertThrows } from "./dev_deps.ts";
import { decode, encode } from "./mod.ts";

Deno.test("encode Puback", () => {
  assertEquals(
    encode({
      type: PacketType.puback,
      id: 1337,
    }),
    Uint8Array.from([
      // fixedHeader
      0x40, // packetType + flags
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
        0x40, // packetType + flags
        2, // remainingLength
        // variableHeader
        5, // id MSB
        57, // id LSB
      ]),
    ),
    {
      type: PacketType.puback,
      id: 1337,
    },
  );
});

Deno.test("decodeShortPubackPackets", () => {
  assertThrows(() => decode(Uint8Array.from([0x40])), Error, "decoding failed");
  assertThrows(() => decode(Uint8Array.from([0x40, 2])), Error, "too short");
  assertThrows(
    () => decode(Uint8Array.from([0x40, 3, 0, 0, 0])),
    Error,
    "too long",
  );
});
