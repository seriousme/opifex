import { PacketType } from "./PacketType.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

import { decode, encode, MQTTLevel } from "./mod.ts";
import type { CodecOpts } from "./mod.ts";

const codecOpts: CodecOpts = {
  protocolLevel: MQTTLevel.v4,
  maxIncomingPacketSize: 0xffff,
  maxOutgoingPacketSize: 0xffff,
};

const codecOptsV5: CodecOpts = {
  protocolLevel: MQTTLevel.v5,
  maxIncomingPacketSize: 0xffff,
  maxOutgoingPacketSize: 0xffff,
};

test("encode Puback", () => {
  assert.deepStrictEqual(
    encode({
      type: PacketType.puback,
      id: 1337,
    }, codecOpts),
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
      codecOpts,
    ),
    {
      type: PacketType.puback,
      id: 1337,
    },
  );
});

test("decodeShortPubackPackets", () => {
  assert.throws(
    () => decode(Uint8Array.from([0x40]), codecOpts),
    Error,
    "decoding failed",
  );
  assert.throws(
    () => decode(Uint8Array.from([0x40, 2]), codecOpts),
    Error,
    "too short",
  );
  assert.throws(
    () => decode(Uint8Array.from([0x40, 3, 0, 0, 0]), codecOpts),
    Error,
    "too long",
  );
  assert.throws(
    () => decode(Uint8Array.from([0x40, 2, 5, 57]), codecOptsV5),
    Error,
    "decoding failed",
  );
});
