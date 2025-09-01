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

test("encode/decode Disconnect V4", () => {
  const packet = {
    type: PacketType.disconnect,
    protocolLevel: MQTTLevel.v4,
  };
  const encoded = encode({
    type: PacketType.disconnect,
    protocolLevel: MQTTLevel.v4,
  }, codecOptsV4);
  assert.deepStrictEqual(
    encoded,
    Uint8Array.from([
      // fixedHeader
      224, // packetType + flags
      0, // remainingLength
    ]),
  );
  const decoded = decode(encoded, codecOptsV4);
  assert.deepStrictEqual(
    decoded,
    packet,
  );
});

test("encode/decode Disconnect V5", () => {
  const packet = {
    type: PacketType.disconnect,
    protocolLevel: MQTTLevel.v5,
    reasonCode: ReasonCode.success,
    properties: {
      reasonString: "reason",
    },
  };

  const encoded = encode(packet, codecOptsV5);
  assert.deepStrictEqual(
    encoded,
    Uint8Array.from([
      // fixedHeader
      224, // packetType + flags
      11, // remaining length
      0, // reasoncode
      9, // property length
      31, //reason string
      0, // string MSB
      6, // string LSB
      114, // r
      101, // e
      97, // a
      115, // s
      111, // o
      110, // n
    ]),
  );
  const decoded = decode(encoded, codecOptsV5);
  assert.deepStrictEqual(decoded, packet);
});

test("encode/decode Short Disconnect V5", () => {
  const packet = {
    type: PacketType.disconnect,
    protocolLevel: MQTTLevel.v5,
    reasonCode: ReasonCode.success,
  };

  const encoded = encode(packet, codecOptsV5);
  assert.deepStrictEqual(
    encoded,
    Uint8Array.from([
      // fixedHeader
      224, // packetType + flags
      0, // remainingLength
    ]),
  );
  const decoded = decode(encoded, codecOptsV5);
  assert.deepStrictEqual(decoded, packet);
});

test("decode invalid Disconnect v4", () => {
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

test("decode invalid Disconnect V5, invalid reasonCode", () => {
  assert.throws(
    () =>
      decode(
        Uint8Array.from([
          // fixedHeader
          224, // packetType + flags
          2, // remainingLength
          ReasonCode.grantedQos1, // reason code
          0, // properties
        ]),
        codecOptsV5,
      ),
    /Invalid reason code/,
  );
});
