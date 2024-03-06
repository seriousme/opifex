import { assertEquals, assertThrows } from "../dev_utils/mod.ts";
import { decodeLength as decode, encodeLength as encode } from "./length.ts";

Deno.test("encodeLength", function encodeLength() {
  assertEquals(encode(0), [0x00]);
  assertEquals(encode(127), [0x7f]);
  assertEquals(encode(128), [0x80, 0x01]);
  assertEquals(encode(16_383), [0xff, 0x7f]);
  assertEquals(encode(16_384), [0x80, 0x80, 0x01]);
  assertEquals(encode(2_097_151), [0xff, 0xff, 0x7f]);
  assertEquals(encode(2_097_152), [0x80, 0x80, 0x80, 0x01]);
  assertEquals(encode(268_435_455), [0xff, 0xff, 0xff, 0x7f]);
  assertThrows(() => encode(268_435_456), Error, "length encoding failed");
});

Deno.test("decodeLength", function decodeLength() {
  assertEquals(decode(Uint8Array.from([0x00]), 0), {
    length: 0,
    numLengthBytes: 1,
  });
  assertEquals(decode(Uint8Array.from([0x7f]), 0), {
    length: 127,
    numLengthBytes: 1,
  });
  assertEquals(decode(Uint8Array.from([0x80, 0x01]), 0), {
    length: 128,
    numLengthBytes: 2,
  });
  assertEquals(decode(Uint8Array.from([0xff, 0x7f]), 0), {
    length: 16_383,
    numLengthBytes: 2,
  });
  assertEquals(decode(Uint8Array.from([0xff, 0x7f, 0xff]), 0), {
    length: 16_383,
    numLengthBytes: 2,
  });
  assertEquals(decode(Uint8Array.from([0x80, 0x80, 0x01]), 0), {
    length: 16_384,
    numLengthBytes: 3,
  });
  assertEquals(decode(Uint8Array.from([0xff, 0xff, 0x7f]), 0), {
    length: 2_097_151,
    numLengthBytes: 3,
  });
  assertEquals(decode(Uint8Array.from([0x80, 0x80, 0x80, 0x01]), 0), {
    length: 2_097_152,
    numLengthBytes: 4,
  });
  assertEquals(decode(Uint8Array.from([0xff, 0xff, 0xff, 0x7f]), 0), {
    length: 268_435_455,
    numLengthBytes: 4,
  });
  assertThrows(
    () => decode(Uint8Array.from([0xff, 0xff, 0xff, 0xff]), 0),
    Error,
    "length decoding failed",
  );
  assertThrows(
    () => decode(Uint8Array.from([0xff, 0xff, 0xff, 0xff, 0x7f]), 0),
    Error,
    "length decoding failed",
  );
  assertThrows(
    () => decode(Uint8Array.from([0xff]), 0),
    Error,
    "length decoding failed",
  );
  assertThrows(
    () => decode(Uint8Array.from([]), 0),
    Error,
    "length decoding failed",
  );
});
