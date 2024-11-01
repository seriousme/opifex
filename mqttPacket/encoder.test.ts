import assert from "node:assert/strict";
import { test } from "node:test";

import { Encoder } from "./encoder.ts";

const utf8Encoder = new TextEncoder();

test("encode byte", () => {
  const byte = 127;
  const encoder = new Encoder();
  encoder.setByte(byte);
  assert.deepStrictEqual(encoder.done(), [byte]);
});

test("encode byte array", () => {
  const byteArray = new Array(300);
  byteArray.fill(127);
  const len = byteArray.length;
  const encoder = new Encoder();
  encoder.setByteArray(Uint8Array.from(byteArray));
  assert.deepStrictEqual(encoder.done(), [len >> 8, len & 0xff, ...byteArray]);
});

test("encode byte array as remainder", () => {
  const str = "hello world";
  const byteArray = utf8Encoder.encode(str);
  const encoder = new Encoder();
  encoder.setRemainder(byteArray);
  assert.deepStrictEqual(encoder.done(), [...byteArray]);
});

test("encode string", () => {
  const str = "hello world";
  const byteArray = utf8Encoder.encode(str);
  const len = byteArray.length;
  const encoder = new Encoder();
  encoder.setUtf8String(str);
  assert.deepStrictEqual(encoder.done(), [0x00, len, ...byteArray]);
});
