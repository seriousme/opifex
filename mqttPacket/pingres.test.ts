import { PacketType } from "./types.ts";
import { assertEquals, assertThrows } from "./dev_deps.ts";
import { decode, encode } from "./mod.ts";

Deno.test("encode Pingres", () => {
  assertEquals(
    encode({
      type: PacketType.pingres,
    }),
    Uint8Array.from([
      // fixedHeader
      208, // packetType + flags
      0, // remainingLength
    ]),
  );
});

Deno.test("decode Pingres", () => {
  assertEquals(
    decode(
      Uint8Array.from([
        // fixedHeader
        208, // packetType + flags
        0, // remainingLength
      ]),
    ),
    {
      type: PacketType.pingres,
    },
  );
});

Deno.test("decode invalid Pingres", () => {
  assertThrows(()=> decode(
      Uint8Array.from([
        // fixedHeader
        208, // packetType + flags
        2, // remainingLength
        0,
        0,
      ]),
    ),Error,"too long"
  );
});
