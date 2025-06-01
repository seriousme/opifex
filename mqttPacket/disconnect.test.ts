import { PacketType } from "./PacketType.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

import { decode, encode, MQTTLevel } from "./mod.ts";

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
      MQTTLevel.v4,
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
        MQTTLevel.v4,
      ),
    Error,
    "too long",
  );
});
