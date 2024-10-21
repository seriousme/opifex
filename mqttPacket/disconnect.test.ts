import { PacketType } from "./PacketType.ts";
import { assertEquals, assertThrows } from "../dev_utils/mod.ts";
import { decode, encode } from "./mod.ts";

Deno.test("encode Disconnect", () => {
  assertEquals(
    encode({
      type: PacketType.disconnect,
    }),
    Uint8Array.from([
      // fixedHeader
      224, // packetType + flags
      0, // remainingLength
    ]),
  );
});

Deno.test("decode Disconnect", () => {
  assertEquals(
    decode(
      Uint8Array.from([
        // fixedHeader
        224, // packetType + flags
        0, // remainingLength
      ]),
    ),
    {
      type: PacketType.disconnect,
    },
  );
});

Deno.test("decode invalid Disconnect", () => {
  assertThrows(
    () =>
      decode(
        Uint8Array.from([
          // fixedHeader
          224, // packetType + flags
          2, // remainingLength
          0,
          0,
        ]),
      ),
    Error,
    "too long",
  );
});
