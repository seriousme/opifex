import { PacketType } from "./PacketType.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

import { decode, encode, MQTTLevel } from "./mod.ts";

test("encode Pubcomp", () => {
  assert.deepStrictEqual(
    encode({
      type: PacketType.pubcomp,
      id: 1337,
    }),
    Uint8Array.from([
      // fixedHeader
      0x70, // packetType + flags
      2, // remainingLength
      // variableHeader
      5, // id MSB
      57, // id LSB
    ]),
  );
});

test("decode Pubcomp ", () => {
  assert.deepStrictEqual(
    decode(
      Uint8Array.from([
        // fixedHeader
        0x70, // packetType + flags
        2, // remainingLength
        // variableHeader
        5, // id MSB
        57, // id LSB
      ]),
      MQTTLevel.v4,
    ),
    {
      type: PacketType.pubcomp,
      id: 1337,
    },
  );
});

test("decodeShortPubcompPackets", () => {
  assert.throws(
    () => decode(Uint8Array.from([0x70]), MQTTLevel.v4),
    Error,
    "decoding failed",
  );
  assert.throws(
    () => decode(Uint8Array.from([0x70, 2]), MQTTLevel.v4),
    Error,
    "too short",
  );
  assert.throws(
    () => decode(Uint8Array.from([0x70, 3, 0, 0, 0]), MQTTLevel.v4),
    Error,
    "too long",
  );
});
