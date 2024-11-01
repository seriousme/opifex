import { PacketType } from "./PacketType.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

import { decode, encode } from "./mod.ts";

test("encode Pingres", () => {
  assert.deepStrictEqual(
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

test("decode Pingres", () => {
  assert.deepStrictEqual(
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

test("decode invalid Pingres", () => {
  assert.throws(
    () =>
      decode(
        Uint8Array.from([
          // fixedHeader
          208, // packetType + flags
          2, // remainingLength
          0,
          0,
        ]),
      ),
    Error,
    "too long",
  );
});
