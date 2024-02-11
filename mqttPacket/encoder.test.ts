import { assertEquals } from "./dev_deps.ts";
import { Encoder } from "./encoder.ts";

const utf8Encoder = new TextEncoder();

Deno.test("encode byte", () => {
  const byte = 127;
  const encoder = new Encoder();
  encoder.setByte(byte);
  assertEquals(encoder.done(), [byte]);
});

Deno.test("encode byte array", () => {
  const byteArray = new Array(300);
  byteArray.fill(127);
  const len = byteArray.length;
  const encoder = new Encoder();
  encoder.setByteArray(Uint8Array.from(byteArray));
  assertEquals(encoder.done(), [len >> 8, len & 0xff, ...byteArray]);
});

Deno.test("encode byte array as remainder", () => {
  const str = "hello world";
  const byteArray = utf8Encoder.encode(str);
  const encoder = new Encoder();
  encoder.setRemainder(byteArray);
  assertEquals(encoder.done(), [...byteArray]);
});

Deno.test("encode string", () => {
  const str = "hello world";
  const byteArray = utf8Encoder.encode(str);
  const len = byteArray.length;
  const encoder = new Encoder();
  encoder.setUtf8String(str);
  assertEquals(encoder.done(), [0x00, len, ...byteArray]);
});
