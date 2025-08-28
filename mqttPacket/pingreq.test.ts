import { PacketType } from "./PacketType.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

import { decode, encode, MQTTLevel } from "./mod.ts";
import type { CodecOpts } from "./mod.ts";

const codecOptsV4: CodecOpts = {
  protocolLevel: MQTTLevel.v4,
  maxIncomingPacketSize: 0xffff,
  maxOutgoingPacketSize: 0xffff,
};

const codecOptsV5: CodecOpts = {
  protocolLevel: MQTTLevel.v5,
  maxIncomingPacketSize: 0xffff,
  maxOutgoingPacketSize: 0xffff,
};

test("encode Pingreq v4", () => {
  assert.deepStrictEqual(
    encode({
      type: PacketType.pingreq,
      protocolLevel: MQTTLevel.v4,
    }, codecOptsV4),
    Uint8Array.from([
      // fixedHeader
      192, // packetType + flags
      0, // remainingLength
    ]),
  );
});

test("decode Pingreq v4", () => {
  assert.deepStrictEqual(
    decode(
      Uint8Array.from([
        // fixedHeader
        192, // packetType + flags
        0, // remainingLength
      ]),
      codecOptsV4,
    ),
    {
      type: PacketType.pingreq,
      protocolLevel: MQTTLevel.v4,
    },
  );
});

test("encode Pingreq v5", () => {
  assert.deepStrictEqual(
    encode({
      type: PacketType.pingreq,
      protocolLevel: MQTTLevel.v5,
    }, codecOptsV5),
    Uint8Array.from([
      // fixedHeader
      192, // packetType + flags
      0, // remainingLength
    ]),
  );
});

test("decode Pingreq v5", () => {
  assert.deepStrictEqual(
    decode(
      Uint8Array.from([
        // fixedHeader
        192, // packetType + flags
        0, // remainingLength
      ]),
      codecOptsV5,
    ),
    {
      type: PacketType.pingreq,
      protocolLevel: MQTTLevel.v5,
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
        codecOptsV4,
      ),
    Error,
    "too long",
  );
});
