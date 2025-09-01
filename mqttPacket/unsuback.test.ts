import assert from "node:assert/strict";
import { test } from "node:test";

import { decode, encode, MQTTLevel, PacketType, ReasonCode } from "./mod.ts";
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

test("encode/decode Unsuback V4", () => {
  const packet = {
    type: PacketType.unsuback,
    protocolLevel: MQTTLevel.v4,
    id: 1337,
  };
  const encoded = encode(packet, codecOptsV4);
  assert.deepStrictEqual(
    encoded,
    Uint8Array.from([
      // fixedHeader
      0xb0, // packetType + flags
      2, // remainingLength
      // variableHeader
      5, // id MSB
      57, // id LSB
    ]),
  );
  const decoded = decode(encoded, codecOptsV4);
  assert.deepStrictEqual(decoded, packet);
});

test("encode/decode Unsuback V5", () => {
  const packet = {
    type: PacketType.unsuback,
    protocolLevel: MQTTLevel.v5,
    id: 1337,
    properties: {
      reasonString: "reason",
    },
    reasonCodes: [ReasonCode.success, ReasonCode.unspecifiedError],
  };
  const encoded = encode(packet, codecOptsV5);
  assert.deepStrictEqual(
    encoded,
    Uint8Array.from([
      // fixedHeader
      176, // packet type + flags
      14, // remaining length
      5, // id MSB
      57, // id LSB
      9, // property length
      31, // reasonString reason
      0, // string lenght MSB
      6, // string lengtg LSB
      114, // r
      101, // e
      97, // a
      115, // s
      111, // o
      110, // n
      0, // ReasonCode.success
      128, // ReasonCode.unspecifiedError
    ]),
  );
  const decoded = decode(encoded, codecOptsV5);
  assert.deepStrictEqual(decoded, packet);
});

test("decode short unsuback packets", () => {
  assert.throws(
    () => decode(Uint8Array.from([0xb0]), codecOptsV4),
    /Packet decoding failed/,
    "single byte",
  );
  assert.throws(
    () => decode(Uint8Array.from([0xb0, 2]), codecOptsV4),
    /too short/,
    "incorrect length",
  );
  assert.throws(
    () => decode(Uint8Array.from([0xb0, 3, 0, 0, 0]), codecOptsV4),
    /too long/,
    "additional bytes",
  );
});

test("decode invalid Unsuback V5, invalid reasonCode", () => {
  assert.throws(
    () =>
      decode(
        Uint8Array.from([224, 4, 1, 0, 0, ReasonCode.quotaExceeded]),
        codecOptsV5,
      ),
    /Invalid reason code/,
  );
});
