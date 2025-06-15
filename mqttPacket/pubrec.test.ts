import { PacketType } from "./PacketType.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

import { decode, encode, MQTTLevel } from "./mod.ts";
const MaxPacketSize = 0xffff;

test("encode Pubrec", () => {
  assert.deepStrictEqual(
    encode({
      type: PacketType.pubrec,
      id: 1337,
    }, MaxPacketSize),
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

test("decode Pubrec ", () => {
  assert.deepStrictEqual(
    decode(
      Uint8Array.from([
        // fixedHeader
        0x50, // packetType + flags
        2, // remainingLength
        // variableHeader
        5, // id MSB
        57, // id LSB
      ]),
      MQTTLevel.v4,
    ),
    {
      type: PacketType.pubrec,
      id: 1337,
    },
  );
});

test("decodeShortPubrecPackets", () => {
  assert.throws(
    () => decode(Uint8Array.from([0x50]), MQTTLevel.v4),
    Error,
    "decoding failed",
  );
  assert.throws(
    () => decode(Uint8Array.from([0x50, 2]), MQTTLevel.v4),
    Error,
    "too short",
  );
  assert.throws(
    () => decode(Uint8Array.from([0x50, 3, 0, 0, 0]), MQTTLevel.v4),
    Error,
    "too long",
  );
});
