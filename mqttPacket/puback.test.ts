import { PacketType } from "./PacketType.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

import { decode, encode } from "./mod.ts";

test("encode Puback", () => {
  assert.deepStrictEqual(
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

test("decode Puback ", () => {
  assert.deepStrictEqual(
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

test("decodeShortPubackPackets", () => {
  assert.throws(
    () => decode(Uint8Array.from([0x40])),
    Error,
    "decoding failed",
  );
  assert.throws(() => decode(Uint8Array.from([0x40, 2])), Error, "too short");
  assert.throws(
    () => decode(Uint8Array.from([0x40, 3, 0, 0, 0])),
    Error,
    "too long",
  );
});
