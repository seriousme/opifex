import { PacketType } from "./PacketType.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

import { decode, encode } from "./mod.ts";

test("encode Pingreq", () => {
  assert.deepStrictEqual(
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

test("decode Pingreq", () => {
  assert.deepStrictEqual(
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

test("decode invalid Pingreq", () => {
  assert.throws(
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
