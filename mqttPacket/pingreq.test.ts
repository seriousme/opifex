import { PacketType } from "./PacketType.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

import { decode, encode, MQTTLevel } from "./mod.ts";
import type { CodecOpts } from "./mod.ts";

const codecOpts: CodecOpts = {
  protocolLevel: MQTTLevel.v4,
  maxIncomingPacketSize: 0xffff,
};

test("encode Pingreq", () => {
  assert.deepStrictEqual(
    encode({
      type: PacketType.pingreq,
    }, codecOpts),
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
      codecOpts,
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
        codecOpts,
      ),
    Error,
    "too long",
  );
});
