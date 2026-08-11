import assert from "node:assert/strict";
import { test } from "node:test";

import { Decoder } from "./decoder.ts";

const utf8encoder = new TextEncoder();
const packetType = 0;

test("decode byte", () => {
  const byte = 127;
  const decoder = new Decoder(packetType, Uint8Array.from([byte]));
  assert.deepStrictEqual(decoder.getByte(), byte);
  assert.deepStrictEqual(decoder.done(), true);
});

test("decode Int16", () => {
  const value = 0xf0f2;
  const msb = 0xf0;
  const lsb = 0xf2;
  const decoder = new Decoder(packetType, Uint8Array.from([msb, lsb]));
  assert.deepStrictEqual(decoder.getInt16(), value);
  assert.deepStrictEqual(decoder.done(), true);
});

test("decode Int16 with remainder", () => {
  const value = 0xf0f2;
  const msb = 0xf0;
  const lsb = 0xf2;
  const decoder = new Decoder(packetType, Uint8Array.from([msb, lsb, 0xff]));
  assert.deepStrictEqual(decoder.getInt16(), value, "value is correct");
  assert.deepStrictEqual(decoder.atEnd(), false);
});

test("decode byte array", () => {
  const byteArray = new Array(300);
  byteArray.fill(127);
  const len = byteArray.length;
  const decoder = new Decoder(
    packetType,
    Uint8Array.from([len >> 8, len & 0xff, ...byteArray]),
  );
  assert.deepStrictEqual(decoder.getByteArray(), Uint8Array.from(byteArray));
  assert.deepStrictEqual(decoder.done(), true);
});

test("decode byte array as remainder", () => {
  const str = "hello world";
  const byteArray = utf8encoder.encode(str);
  const decoder = new Decoder(packetType, byteArray);
  assert.deepStrictEqual(decoder.getRemainder(), byteArray);
  assert.deepStrictEqual(decoder.done(), true);
});

test("decode byte array as empty remainder", () => {
  const str = "hello world";
  const emptyArray = Uint8Array.from([]);
  const byteArray = utf8encoder.encode(str);
  const len = byteArray.length;
  const decoder = new Decoder(
    packetType,
    Uint8Array.from([0x00, len, ...byteArray]),
  );
  assert.deepStrictEqual(decoder.getUTF8String(), str);
  assert.deepStrictEqual(decoder.getRemainder(), emptyArray);
  assert.deepStrictEqual(decoder.done(), true);
});

test("decode string", () => {
  const str = "hello world";
  const byteArray = utf8encoder.encode(str);
  const len = byteArray.length;
  const decoder = new Decoder(
    packetType,
    Uint8Array.from([0x00, len, ...byteArray]),
  );
  assert.deepStrictEqual(decoder.getUTF8String(), str);
  assert.deepStrictEqual(decoder.done(), true);
});

test("Buffer too short", () => {
  const str = "hello world";
  const byteArray = utf8encoder.encode(str);
  const len = byteArray.length;
  const decoder = new Decoder(
    packetType,
    Uint8Array.from([0x00, len + 1, ...byteArray]),
  );
  assert.throws(() => decoder.getUTF8String(), Error, "too short");
});

test("Buffer too long", () => {
  const str = "hello world";
  const byteArray = utf8encoder.encode(str);
  const len = byteArray.length;
  const decoder = new Decoder(
    packetType,
    Uint8Array.from([0x00, len, ...byteArray, 0]),
  );
  assert.deepStrictEqual(decoder.getUTF8String(), str);
  assert.throws(() => decoder.done(), Error, "too long");
});
