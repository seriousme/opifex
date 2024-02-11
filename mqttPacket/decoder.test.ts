import { assertEquals, assertThrows } from "./dev_deps.ts";
import { Decoder } from "./decoder.ts";

const utf8encoder = new TextEncoder();

Deno.test("decode byte", () => {
  const byte = 127;
  const decoder = new Decoder(Uint8Array.from([byte]));
  assertEquals(decoder.getByte(), byte);
  assertEquals(decoder.done(), true);
});

Deno.test("decode Int16", () => {
  const value = 0xf0f2;
  const msb = 0xf0;
  const lsb = 0xf2;
  const decoder = new Decoder(Uint8Array.from([msb, lsb]));
  assertEquals(decoder.getInt16(), value);
  assertEquals(decoder.done(), true);
});

Deno.test("decode Int16 with remainder", () => {
  const value = 0xf0f2;
  const msb = 0xf0;
  const lsb = 0xf2;
  const decoder = new Decoder(Uint8Array.from([msb, lsb, 0xff]));
  assertEquals(decoder.getInt16(), value, "value is correct");
  assertEquals(decoder.atEnd(), false);
});

Deno.test("decode byte array", () => {
  const byteArray = new Array(300);
  byteArray.fill(127);
  const len = byteArray.length;
  const decoder = new Decoder(
    Uint8Array.from([len >> 8, len & 0xff, ...byteArray]),
  );
  assertEquals(decoder.getByteArray(), Uint8Array.from(byteArray));
  assertEquals(decoder.done(), true);
});

Deno.test("decode byte array as remainder", () => {
  const str = "hello world";
  const byteArray = utf8encoder.encode(str);
  const decoder = new Decoder(byteArray);
  assertEquals(decoder.getRemainder(), byteArray);
  assertEquals(decoder.done(), true);
});

Deno.test("decode byte array as empty remainder", () => {
  const str = "hello world";
  const emptyArray = Uint8Array.from([]);
  const byteArray = utf8encoder.encode(str);
  const len = byteArray.length;
  const decoder = new Decoder(Uint8Array.from([0x00, len, ...byteArray]));
  assertEquals(decoder.getUtf8String(), str);
  assertEquals(decoder.getRemainder(), emptyArray);
  assertEquals(decoder.done(), true);
});

Deno.test("decode string", () => {
  const str = "hello world";
  const byteArray = utf8encoder.encode(str);
  const len = byteArray.length;
  const decoder = new Decoder(Uint8Array.from([0x00, len, ...byteArray]));
  assertEquals(decoder.getUtf8String(), str);
  assertEquals(decoder.done(), true);
});

Deno.test("decode topic", () => {
  const str = "hello world";
  const byteArray = utf8encoder.encode(str);
  const len = byteArray.length;
  const decoder = new Decoder(Uint8Array.from([0x00, len, ...byteArray]));
  assertEquals(decoder.getTopic(), str);
  assertEquals(decoder.done(), true);
});

Deno.test("Topic too short", () => {
  const decoder = new Decoder(Uint8Array.from([0x00, 0]));
  assertThrows(
    () => decoder.getTopic(),
    Error,
    "Topic must contain valid UTF-8 and contain more than 1 byte and no wildcards",
  );
});

Deno.test("Invalid topic", () => {
  const decoder = new Decoder(Uint8Array.from([0x00, 0x01, 0x00]));
  assertThrows(
    () => decoder.getTopic(),
    Error,
    "Topic must contain valid UTF-8 and contain more than 1 byte and no wildcards",
  );
});

Deno.test("Invalid topicFilter", () => {
  const decoder = new Decoder(Uint8Array.from([0x00, 0x01, 0x00]));
  assertThrows(
    () => decoder.getTopic(),
    Error,
    "Topic must contain valid UTF-8 and contain more than 1 byte and no wildcards",
  );
});

Deno.test("Buffer too short", () => {
  const str = "hello world";
  const byteArray = utf8encoder.encode(str);
  const len = byteArray.length;
  const decoder = new Decoder(Uint8Array.from([0x00, len + 1, ...byteArray]));
  assertThrows(() => decoder.getUtf8String(), Error, "too short");
});

Deno.test("Buffer too long", () => {
  const str = "hello world";
  const byteArray = utf8encoder.encode(str);
  const len = byteArray.length;
  const decoder = new Decoder(Uint8Array.from([0x00, len, ...byteArray, 0]));
  assertEquals(decoder.getUtf8String(), str);
  assertThrows(() => decoder.done(), Error, "too long");
});
