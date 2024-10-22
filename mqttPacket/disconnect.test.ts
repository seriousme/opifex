import { PacketType } from "./PacketType.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
;
import { decode, encode } from "./mod.ts";

test("encode Disconnect", () => {
  assert.deepStrictEqual(
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

test("decode Disconnect", () => {
  assert.deepStrictEqual(
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

test("decode invalid Disconnect", () => {
  assert.throws(
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
