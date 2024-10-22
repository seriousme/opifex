import { PacketType } from "./PacketType.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
;
import { decode, encode } from "./mod.ts";

test("encode Unsubscribe", () => {
  assert.deepStrictEqual(
    encode({
      type: PacketType.unsubscribe,
      id: 1,
      topicFilters: ["a/b", "c/d"],
    }),
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
});

test("decode Unsubscribe", () => {
  assert.deepStrictEqual(
    decode(
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
    ),
    {
      type: PacketType.unsubscribe,
      id: 1,
      topicFilters: ["a/b", "c/d"],
    },
  );
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
      ),
    Error,
    "too short",
  );
});
