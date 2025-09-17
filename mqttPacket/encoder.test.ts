import assert from "node:assert/strict";
import { test } from "node:test";

import { Encoder } from "./encoder.ts";
import { encodeLength } from "./length.ts";
import { PacketType, ReasonCode } from "./mod.ts";

const utf8Encoder = new TextEncoder();

test("encode byte", () => {
  const byte = 127;
  const encoder = new Encoder(0);
  encoder.setByte(byte);
  assert.deepStrictEqual(encoder.done(0), new Uint8Array([0, 1, byte]));
});

test("encode byte array", () => {
  const byteArray = new Array(300);
  byteArray.fill(127);
  const len = byteArray.length;
  const payload = [len >> 8, len & 0xff, ...byteArray];
  const encodedLength = encodeLength(payload.length);
  const packet = [0, ...encodedLength, ...payload];
  const encoder = new Encoder(0);
  encoder.setByteArray(Uint8Array.from(byteArray));
  assert.deepStrictEqual(encoder.done(0), new Uint8Array(packet));
});

test("encode byte array as remainder", () => {
  const str = "hello world";
  const byteArray = utf8Encoder.encode(str);
  const encodedLength = encodeLength(byteArray.length);
  const packet = [0, ...encodedLength, ...byteArray];
  const encoder = new Encoder(0);
  encoder.setRemainder(byteArray);
  assert.deepStrictEqual(encoder.done(0), new Uint8Array(packet));
});

test("encode string", () => {
  const str = "hello world";
  const byteArray = utf8Encoder.encode(str);
  const len = byteArray.length;
  const payload = [len >> 8, len & 0xff, ...byteArray];
  const encodedLength = encodeLength(payload.length);
  const packet = [0, ...encodedLength, ...payload];
  const encoder = new Encoder(0);
  encoder.setUtf8String(str);
  assert.deepStrictEqual(encoder.done(0), new Uint8Array(packet));
});

test("encode reasonCode", () => {
  const reasonCode = ReasonCode.success;
  const encoder = new Encoder(PacketType.connack);
  encoder.setReasonCode(reasonCode);
  assert.deepStrictEqual(encoder.done(0), new Uint8Array([32, 1, reasonCode]));
});

test("encode invalid reasonCode", () => {
  const encoder = new Encoder(PacketType.connack);
  assert.throws(() => {
    encoder.setReasonCode(ReasonCode.noMatchingSubscribers);
  }, /Reason code 16 not allowed for packet type 2/);
});
