import { PacketType } from "./PacketType.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

import { decode, encode } from "./mod.ts";

test("encode Subscribe", () => {
  assert.deepStrictEqual(
    encode({
      type: PacketType.subscribe,
      id: 1,
      subscriptions: [
        { topicFilter: "a/b", qos: 0 },
        { topicFilter: "c/d", qos: 1 },
      ],
    }),
    Uint8Array.from([
      // fixedHeader
      0x82, // packetType + flags
      14, // remainingLength
      // variableHeader
      0, // id MSB
      1, // id LSB
      // payload
      0, // topic filter length MSB
      3, // topic filter length LSB
      97, // 'a'
      47, // '/'
      98, // 'b'
      0, // qos
      0, // topic filter length MSB
      3, // topic filter length LSB
      99, // 'c'
      47, // '/'
      100, // 'd'
      1, // qos
    ]),
  );
});

test("decode Subscribe", () => {
  assert.deepStrictEqual(
    decode(
      Uint8Array.from([
        // fixedHeader
        0x82, // packetType + flags
        14, // remainingLength
        // variableHeader
        0, // id MSB
        1, // id LSB
        // payload
        0, // topic filter length MSB
        3, // topic filter length LSB
        97, // 'a'
        47, // '/'
        98, // 'b'
        0, // qos
        0, // topic filter length MSB
        3, // topic filter length LSB
        99, // 'c'
        47, // '/'
        100, // 'd'
        1, // qos
      ]),
    ),
    {
      type: PacketType.subscribe,
      id: 1,
      subscriptions: [
        { topicFilter: "a/b", qos: 0 },
        { topicFilter: "c/d", qos: 1 },
      ],
    },
  );
});

test("decode Subscribe missing bit 1 flag", () => {
  assert.throws(
    () =>
      decode(
        Uint8Array.from([
          // fixedHeader
          0x80, // packetType + flags
          14, // remainingLength
          // variableHeader
          0, // id MSB
          1, // id LSB
          // payload
          0, // topic filter length MSB
          3, // topic filter length LSB
          97, // 'a'
          47, // '/'
          98, // 'b'
          0, // qos
          0, // topic filter length MSB
          3, // topic filter length LSB
          99, // 'c'
          47, // '/'
          100, // 'd'
          1, // qos
        ]),
      ),
    Error,
    "Invalid header",
  );
});

test("decode Subscribe packet too short", () => {
  assert.throws(
    () =>
      decode(
        Uint8Array.from([
          // fixedHeader
          0x82, // packetType + flags
          14, // remainingLength
          // variableHeader
          0, // id MSB
          1, // id LSB
          // payload
          0, // topic filter length MSB
          3, // topic filter length LSB
          97, // 'a'
          47, // '/'
          98, // 'b'
          0, // qos
          0, // topic filter length MSB
          3, // topic filter length LSB
          99, // 'c'
          47, // '/'
          1, // qos
        ]),
      ),
    Error,
    "Invalid qos",
  );
  assert.throws(
    () =>
      decode(
        Uint8Array.from([
          // fixedHeader
          0x82, // packetType + flags
          14, // remainingLength
          // variableHeader
          0, // id MSB
          1, // id LSB
          // payload
          0, // topic filter length MSB
          3, // topic filter length LSB
          97, // 'a'
          47, // '/'
          98, // 'b'
          0, // qos
          0, // topic filter length MSB
          3, // topic filter length LSB
          99, // 'c'
        ]),
      ),
    Error,
    "too short",
  );
  assert.throws(
    () =>
      decode(
        Uint8Array.from([
          // fixedHeader
          0x82, // packetType + flags
          14, // remainingLength
          // variableHeader
          0, // id MSB
          1, // id LSB
        ]),
      ),
    Error,
    "too short",
  );
});

test("decode Subscribe packet invalid packet id with QoS > 0", () => {
  assert.throws(
    () =>
      decode(
        Uint8Array.from([
          // fixedHeader
          0x82, // packetType + flags
          13, // remainingLength
          // variableHeader
          0, // id MSB
          0, // id LSB
          // payload
          0, // topic filter length MSB
          3, // topic filter length LSB
          97, // 'a'
          47, // '/'
          98, // 'b'
          0, // qos
          0, // topic filter length MSB
          2, // topic filter length LSB
          99, // 'c'
          47, // '/'
          1, // qos
        ]),
      ),
    Error,
    "Invalid packet identifier",
  );
  assert.throws(
    () =>
      decode(
        Uint8Array.from([
          // fixedHeader
          0x82, // packetType + flags
          13, // remainingLength
          // variableHeader
          0, // id MSB
          0, // id LSB
          // payload
          0, // topic filter length MSB
          3, // topic filter length LSB
          97, // 'a'
          47, // '/'
          98, // 'b'
          0, // qos
          0, // topic filter length MSB
          2, // topic filter length LSB
          99, // 'c'
          47, // '/'
          2, // qos
        ]),
      ),
    Error,
    "Invalid packet identifier",
  );
});
