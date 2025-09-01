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

test("encode/decode Unsubscribe V4", () => {
  const packet = {
    type: PacketType.unsubscribe,
    protocolLevel: MQTTLevel.v4,
    id: 1,
    topicFilters: ["a/b", "c/d"],
  };
  const encoded = encode(packet, codecOptsV4);
  assert.deepStrictEqual(
    encoded,
    Uint8Array.from([
      // fixedHeader
      0xa2, // packetType + flags
      12, // remainingLength
      // variableHeader
      0, // id MSB
      1, // id LSB
      // payload
      0, // topic filter length MSB
      3, // topic filter length LSB
      97, // 'a'
      47, // '/'
      98, // 'b'
      0, // topic filter length MSB
      3, // topic filter length LSB
      99, // 'c'
      47, // '/'
      100, // 'd'
    ]),
  );
  const decoded = decode(encoded, codecOptsV4);
  assert.deepStrictEqual(decoded, packet);
});

test("encode/decode Unsubscribe V5", () => {
  const packet = {
    type: PacketType.unsubscribe,
    protocolLevel: MQTTLevel.v5,
    id: 1,
    properties: {},
    topicFilters: ["a/b", "c/d"],
  };
  const encoded = encode(packet, codecOptsV4);
  assert.deepStrictEqual(
    encoded,
    Uint8Array.from([
      // fixedHeader
      0xa2, // packetType + flags
      13, // remainingLength
      // variableHeader
      0, // id MSB
      1, // id LSB
      0, // property length
      // payload
      0, // topic filter length MSB
      3, // topic filter length LSB
      97, // 'a'
      47, // '/'
      98, // 'b'
      0, // topic filter length MSB
      3, // topic filter length LSB
      99, // 'c'
      47, // '/'
      100, // 'd'
    ]),
  );
  const decoded = decode(encoded, codecOptsV5);
  assert.deepStrictEqual(decoded, packet);
});

test("decode Unsubscribe missing bit 1 flag", () => {
  assert.throws(
    () =>
      decode(
        Uint8Array.from([
          // fixedHeader
          0xa0, // packetType + flags
          12, // remainingLength
          // variableHeader
          0, // id MSB
          1, // id LSB
          // payload
          0, // topic filter length MSB
          3, // topic filter length LSB
          97, // 'a'
          47, // '/'
          98, // 'b'
          0, // topic filter length MSB
          3, // topic filter length LSB
          99, // 'c'
          47, // '/'
          100, // 'd'
        ]),
        codecOptsV4,
      ),
    Error,
    "Invalid header",
  );
});

test("decode unsubscribe packet too short", () => {
  assert.throws(
    () =>
      decode(
        Uint8Array.from([
          // fixedHeader
          0xa2, // packetType + flags
          10, // remainingLength
          // variableHeader
          0, // id MSB
          1, // id LSB
          // payload
          0, // topic filter length MSB
          3, // topic filter length LSB
          97, // 'a'
          47, // '/'
          98, // 'b'
          0, // topic filter length MSB
          3, // topic filter length LSB
          99, // 'c'
        ]),
        codecOptsV4,
      ),
    Error,
    "too short",
  );
  assert.throws(
    () =>
      decode(
        Uint8Array.from([
          // fixedHeader
          0xa2, // packetType + flags
          14, // remainingLength
          // variableHeader
          0, // id MSB
          1, // id LSB
        ]),
        codecOptsV4,
      ),
    Error,
    "too short",
  );
});
