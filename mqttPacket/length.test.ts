import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeLength as decode, encodeLength as encode } from "./length.ts";

test("encodeLength", function encodeLength() {
  assert.deepStrictEqual(encode(0), [0x00]);
  assert.deepStrictEqual(encode(127), [0x7f]);
  assert.deepStrictEqual(encode(128), [0x80, 0x01]);
  assert.deepStrictEqual(encode(16_383), [0xff, 0x7f]);
  assert.deepStrictEqual(encode(16_384), [0x80, 0x80, 0x01]);
  assert.deepStrictEqual(encode(2_097_151), [0xff, 0xff, 0x7f]);
  assert.deepStrictEqual(encode(2_097_152), [0x80, 0x80, 0x80, 0x01]);
  assert.deepStrictEqual(encode(268_435_455), [0xff, 0xff, 0xff, 0x7f]);
  assert.throws(() => encode(268_435_456), Error, "length encoding failed");
});

test("decodeLength", function decodeLength() {
  assert.deepStrictEqual(decode(Uint8Array.from([0x00]), 0), {
    length: 0,
    numLengthBytes: 1,
  });
  assert.deepStrictEqual(decode(Uint8Array.from([0x7f]), 0), {
    length: 127,
    numLengthBytes: 1,
  });
  assert.deepStrictEqual(decode(Uint8Array.from([0x80, 0x01]), 0), {
    length: 128,
    numLengthBytes: 2,
  });
  assert.deepStrictEqual(decode(Uint8Array.from([0xff, 0x7f]), 0), {
    length: 16_383,
    numLengthBytes: 2,
  });
  assert.deepStrictEqual(decode(Uint8Array.from([0xff, 0x7f, 0xff]), 0), {
    length: 16_383,
    numLengthBytes: 2,
  });
  assert.deepStrictEqual(decode(Uint8Array.from([0x80, 0x80, 0x01]), 0), {
    length: 16_384,
    numLengthBytes: 3,
  });
  assert.deepStrictEqual(decode(Uint8Array.from([0xff, 0xff, 0x7f]), 0), {
    length: 2_097_151,
    numLengthBytes: 3,
  });
  assert.deepStrictEqual(decode(Uint8Array.from([0x80, 0x80, 0x80, 0x01]), 0), {
    length: 2_097_152,
    numLengthBytes: 4,
  });
  assert.deepStrictEqual(decode(Uint8Array.from([0xff, 0xff, 0xff, 0x7f]), 0), {
    length: 268_435_455,
    numLengthBytes: 4,
  });
  assert.throws(
    () => decode(Uint8Array.from([0xff, 0xff, 0xff, 0xff]), 0),
    Error,
    "length decoding failed",
  );
  assert.throws(
    () => decode(Uint8Array.from([0xff, 0xff, 0xff, 0xff, 0x7f]), 0),
    Error,
    "length decoding failed",
  );
  assert.throws(
    () => decode(Uint8Array.from([0xff]), 0),
    Error,
    "length decoding failed",
  );
  assert.throws(
    () => decode(Uint8Array.from([]), 0),
    Error,
    "length decoding failed",
  );
});
