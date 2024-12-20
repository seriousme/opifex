import assert from "node:assert/strict";
import { test } from "node:test";
import { decode, encode } from "./mod.ts";
import { PacketType } from "./PacketType.ts";

test("encode Connack packet", () => {
  assert.deepStrictEqual(
    encode({
      type: PacketType.connack,
      sessionPresent: false,
      returnCode: 0,
    }),
    Uint8Array.from([
      // fixedHeader
      0x20, // packetType + flags
      2, // remainingLength
      // variableHeader
      0, // connack flags
      0, // return code
    ]),
  );
});

test("decode Connack packet", () => {
  assert.deepStrictEqual(
    decode(
      Uint8Array.from([
        // fixedHeader
        0x20, // packetType + flags
        2, // remainingLength
        // variableHeader
        0, // connack flags
        0, // return code
      ]),
    ),
    {
      type: PacketType.connack,
      sessionPresent: false,
      returnCode: 0,
    },
  );
});

test("encode Connack with session present", () => {
  assert.deepStrictEqual(
    encode({
      type: PacketType.connack,
      sessionPresent: true,
      returnCode: 0,
    }),
    Uint8Array.from([
      // fixedHeader
      0x20, // packetType + flags
      2, // remainingLength
      // variableHeader
      1, // connack flags (sessionPresent)
      0, // return code
    ]),
  );
});

test("decode Connack with session present", () => {
  assert
    .deepStrictEqual(
      decode(
        Uint8Array.from([
          // fixedHeader
          0x20, // packetType + flags
          2, // remainingLength
          // variableHeader
          1, // connack flags (sessionPresent)
          0, // return code
        ]),
      ),
      {
        type: PacketType.connack,
        sessionPresent: true,
        returnCode: 0,
      },
    );
});

test("decode Connack with non-zero returnCode", () => {
  assert.deepStrictEqual(
    decode(
      Uint8Array.from([
        // fixedHeader
        0x20, // packetType + flags
        2, // remainingLength
        // variableHeader
        0, // connack flags
        4, // return code (bad username or password)
      ]),
    ),
    {
      type: PacketType.connack,
      sessionPresent: false,
      returnCode: 4,
    },
  );
});

test("decode Connack with invalid returnCode", () => {
  assert.throws(
    () =>
      decode(
        Uint8Array.from([
          // fixedHeader
          0x20, // packetType + flags
          2, // remainingLength
          // variableHeader
          0, // connack flags
          64, // return code (reserved)
        ]),
      ),
    Error,
    "Invalid return code",
  );
});

test("decode short Connack packets", () => {
  assert.throws(
    () => decode(Uint8Array.from([0x20])),
    Error,
    "decoding failed",
  );
  assert.throws(() => decode(Uint8Array.from([0x20, 2])), Error, "too short");
  assert.throws(() => decode(Uint8Array.from([0x20, 2, 0])), Error, "too long");
});
