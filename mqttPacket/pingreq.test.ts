import { PacketType } from "./types.ts";
import { assertEquals, assertThrows } from "./dev_deps.ts";
import { decode, encode } from "./mod.ts";

Deno.test("encode Pingreq", () => {
  assertEquals(
    encode({
      type: PacketType.pingreq,
    }),
    Uint8Array.from([
      // fixedHeader
      192, // packetType + flags
      0, // remainingLength
    ]),
  );
});

Deno.test("decode Pingreq", () => {
  assertEquals(
    decode(
      Uint8Array.from([
        // fixedHeader
        192, // packetType + flags
        0, // remainingLength
      ]),
    ),
    {
      type: PacketType.pingreq,
    },
  );
});

Deno.test("decode invalid Pingreq", () => {
  assertThrows(
    () =>
      decode(
        Uint8Array.from([
          // fixedHeader
          192, // packetType + flags
          2, // remainingLength
          0,
          0,
        ]),
      ),
    Error,
    "too long",
  );
});
