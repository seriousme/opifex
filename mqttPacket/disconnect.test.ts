import { PacketType } from "./PacketType.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

import { decode, encode, MQTTLevel } from "./mod.ts";
import type { CodecOpts } from "./mod.ts";

const codecOpts: CodecOpts = {
  protocolLevel: MQTTLevel.v4,
  maxIncomingPacketSize: 0xffff,
};

test("encode Disconnect", () => {
  assert.deepStrictEqual(
    encode({
      type: PacketType.disconnect,
    }, codecOpts),
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
      codecOpts,
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
        codecOpts,
      ),
    Error,
    "too long",
  );
});
