import { PacketType } from "./PacketType.ts";
import { assertEquals, assertThrows } from "../dev_utils/mod.ts";
import { decode, encode } from "./mod.ts";

Deno.test("encode Pubrec", () => {
  assertEquals(
    encode({
      type: PacketType.pubrec,
      id: 1337,
    }),
    Uint8Array.from([
      // fixedHeader
      0x50, // packetType + flags
      2, // remainingLength
      // variableHeader
      5, // id MSB
      57, // id LSB
    ]),
  );
});

Deno.test("decode Pubrec ", () => {
  assertEquals(
    decode(
      Uint8Array.from([
        // fixedHeader
        0x50, // packetType + flags
        2, // remainingLength
        // variableHeader
        5, // id MSB
        57, // id LSB
      ]),
    ),
    {
      type: PacketType.pubrec,
      id: 1337,
    },
  );
});

Deno.test("decodeShortPubrecPackets", () => {
  assertThrows(() => decode(Uint8Array.from([0x50])), Error, "decoding failed");
  assertThrows(() => decode(Uint8Array.from([0x50, 2])), Error, "too short");
  assertThrows(
    () => decode(Uint8Array.from([0x50, 3, 0, 0, 0])),
    Error,
    "too long",
  );
});
