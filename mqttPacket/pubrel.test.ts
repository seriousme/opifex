import { PacketType } from "./PacketType.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

import { decode, encode } from "./mod.ts";

test("encode Pubrel", () => {
  assert.deepStrictEqual(
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

test("decode Pubrel ", () => {
  assert.deepStrictEqual(
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

test("decodeShortPubrelPackets", () => {
  assert.throws(
    () => decode(Uint8Array.from([0x60])),
    Error,
    "decoding failed",
  );
  assert.throws(() => decode(Uint8Array.from([0x60, 2])), Error, "too short");
  assert.throws(
    () => decode(Uint8Array.from([0x60, 3, 0, 0, 0])),
    Error,
    "too long",
  );
});
