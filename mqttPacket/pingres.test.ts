import { PacketType } from "./PacketType.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

import { decode, encode, MQTTLevel } from "./mod.ts";
const MaxPacketSize = 0xffff;

test("encode Pingres", () => {
  assert.deepStrictEqual(
    encode({
      type: PacketType.pingres,
    }, MaxPacketSize),
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
      MQTTLevel.v4,
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
        MQTTLevel.v4,
      ),
    Error,
    "too long",
  );
});
