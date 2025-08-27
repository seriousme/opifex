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

test("encode Disconnect V4", () => {
  assert.deepStrictEqual(
    encode({
      type: PacketType.disconnect,
      protocolLevel: MQTTLevel.v4,
    }, codecOptsV4),
    Uint8Array.from([
      // fixedHeader
      224, // packetType + flags
      0, // remainingLength
    ]),
  );
});

test("encode/decode short Disconnect V5", () => {
  const packet = {
      type: PacketType.disconnect,
      protocolLevel: MQTTLevel.v5,
      reasonCode: 0,
    }

  const buf = Uint8Array.from([
      // fixedHeader
      224, // packetType + flags
      0, // remainingLength
    ])
  assert.deepStrictEqual(
    encode(packet, codecOptsV5),
    buf,
  );
  assert.deepStrictEqual(
    decode(buf, codecOptsV5),
    packet,
  );
});

test("decode Disconnect V4", () => {
  assert.deepStrictEqual(
    decode(
      Uint8Array.from([
        // fixedHeader
        224, // packetType + flags
        0, // remainingLength
      ]),
      codecOptsV4,
    ),
    {
      type: PacketType.disconnect,
      protocolLevel: MQTTLevel.v4,
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
        codecOptsV4,
      ),
    Error,
    "too long",
  );
});
