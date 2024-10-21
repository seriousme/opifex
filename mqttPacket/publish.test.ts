import { PacketType } from "./PacketType.ts";
import { assertEquals, assertThrows } from "../dev_utils/mod.ts";
import { decode, encode } from "./mod.ts";

// const utf8Decoder = new TextDecoder();
const utf8Encoder = new TextEncoder();
const payload = utf8Encoder.encode("payload");

Deno.test("encode Publish", () => {
  assertEquals(
    encode({
      type: PacketType.publish,
      topic: "a/b",
      payload,
    }),
    Uint8Array.from([
      // fixedHeader
      48, // packetType + flags
      12, // remainingLength
      // variableHeader
      0, // topicLength MSB
      3, // topicLength LSB
      97, // 'a'
      47, // '/'
      98, // 'b'
      // payload
      112, // 'p'
      97, // 'a'
      121, // 'y'
      108, // 'l'
      111, // 'o'
      97, // 'a'
      100, // 'd'
    ]),
  );
});

Deno.test("decode Publish", () => {
  assertEquals(
    decode(
      Uint8Array.from([
        // fixedHeader
        48, // packetType + flags
        12, // remainingLength
        // variableHeader
        0, // topicLength MSB
        3, // topicLength LSB
        97, // 'a'
        47, // '/'
        98, // 'b'
        // payload
        112, // 'p'
        97, // 'a'
        121, // 'y'
        108, // 'l'
        111, // 'o'
        97, // 'a'
        100, // 'd'
      ]),
    ),
    {
      type: PacketType.publish,
      dup: false,
      qos: 0,
      retain: false,
      id: 0,
      topic: "a/b",
      payload: Uint8Array.from([
        112, // 'p'
        97, // 'a'
        121, // 'y'
        108, // 'l'
        111, // 'o'
        97, // 'a'
        100, // 'd'
      ]),
    },
  );
});

Deno.test("decode Publish with extra bytes", () => {
  assertEquals(
    decode(
      Uint8Array.from([
        // fixedHeader
        48, // packetType + flags
        12, // remainingLength
        // variableHeader
        0, // topicLength MSB
        3, // topicLength LSB
        97, // 'a'
        47, // '/'
        98, // 'b'
        // payload
        112, // 'p'
        97, // 'a'
        121, // 'y'
        108, // 'l'
        111, // 'o'
        97, // 'a'
        100, // 'd'
        101, // 'e'
        116, // 't'
        99, // 'c'
      ]),
    ),
    {
      type: PacketType.publish,
      dup: false,
      qos: 0,
      retain: false,
      id: 0,
      topic: "a/b",
      payload: Uint8Array.from([
        112, // 'p'
        97, // 'a'
        121, // 'y'
        108, // 'l'
        111, // 'o'
        97, // 'a'
        100, // 'd'
      ]),
    },
  );
});

Deno.test("decode Publish no payload", () => {
  assertEquals(
    decode(
      Uint8Array.from([
        // fixedHeader
        48, // packetType + flags
        5, // remainingLength
        // variableHeader
        0, // topicLength MSB
        3, // topicLength LSB
        97, // 'a'
        47, // '/'
        98, // 'b'
        // payload
      ]),
    ),
    {
      type: PacketType.publish,
      dup: false,
      qos: 0,
      retain: false,
      id: 0,
      topic: "a/b",
      payload: Uint8Array.from([]),
    },
  );
});

Deno.test("Invalid qos", () => {
  assertThrows(
    () =>
      decode(
        Uint8Array.from([
          // fixedHeader
          0x36, // packetType + flags
          5, // remainingLength
          // variableHeader
          0, // topicLength MSB
          3, // topicLength LSB
          97, // 'a'
          47, // '/'
          98, // 'b'
          // payload
        ]),
      ),
    Error,
    "Invalid qos",
  );
});
Deno.test("Invalid qos for duplicate", () => {
  assertThrows(
    () =>
      decode(
        Uint8Array.from([
          // fixedHeader
          0x38, // packetType + flags
          5, // remainingLength
          // variableHeader
          0, // topicLength MSB
          3, // topicLength LSB
          97, // 'a'
          47, // '/'
          98, // 'b'
          // payload
        ]),
      ),
    Error,
    "Invalid qos for possible duplicate",
  );
});
