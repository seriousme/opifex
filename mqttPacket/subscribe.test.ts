import { PacketType } from "./types.ts";
import { assertEquals, assertThrows } from "./dev_deps.ts";
import { decode, encode } from "./mod.ts";

Deno.test("encode Subscribe", () => {
  assertEquals(
    encode({
      type: PacketType.subscribe,
      id: 1,
      subscriptions: [
        { topicFilter: "a/b", qos: 0 },
        { topicFilter: "c/d", qos: 1 },
      ],
    }),
    Uint8Array.from([
      // fixedHeader
      0x82, // packetType + flags
      14, // remainingLength
      // variableHeader
      0, // id MSB
      1, // id LSB
      // payload
      0, // topic filter length MSB
      3, // topic filter length LSB
      97, // 'a'
      47, // '/'
      98, // 'b'
      0, // qos
      0, // topic filter length MSB
      3, // topic filter length LSB
      99, // 'c'
      47, // '/'
      100, // 'd'
      1, // qos
    ]),
  );
});

Deno.test("decode Subscribe", () => {
  assertEquals(
    decode(
      Uint8Array.from([
        // fixedHeader
        0x82, // packetType + flags
        14, // remainingLength
        // variableHeader
        0, // id MSB
        1, // id LSB
        // payload
        0, // topic filter length MSB
        3, // topic filter length LSB
        97, // 'a'
        47, // '/'
        98, // 'b'
        0, // qos
        0, // topic filter length MSB
        3, // topic filter length LSB
        99, // 'c'
        47, // '/'
        100, // 'd'
        1, // qos
      ]),
    ),
    {
      type: PacketType.subscribe,
      id: 1,
      subscriptions: [
        { topicFilter: "a/b", qos: 0 },
        { topicFilter: "c/d", qos: 1 },
      ],
    },
  );
});

Deno.test("decode Subscribe missing bit 1 flag", () => {
  assertThrows(
    () =>
      decode(
        Uint8Array.from([
          // fixedHeader
          0x80, // packetType + flags
          14, // remainingLength
          // variableHeader
          0, // id MSB
          1, // id LSB
          // payload
          0, // topic filter length MSB
          3, // topic filter length LSB
          97, // 'a'
          47, // '/'
          98, // 'b'
          0, // qos
          0, // topic filter length MSB
          3, // topic filter length LSB
          99, // 'c'
          47, // '/'
          100, // 'd'
          1, // qos
        ]),
      ),
    Error,
    "Invalid header",
  );
});

Deno.test("decode Subscribe packet too short", () => {
  assertThrows(
    () =>
      decode(
        Uint8Array.from([
          // fixedHeader
          0x82, // packetType + flags
          14, // remainingLength
          // variableHeader
          0, // id MSB
          1, // id LSB
          // payload
          0, // topic filter length MSB
          3, // topic filter length LSB
          97, // 'a'
          47, // '/'
          98, // 'b'
          0, // qos
          0, // topic filter length MSB
          3, // topic filter length LSB
          99, // 'c'
          47, // '/'
          1, // qos
        ]),
      ),
    Error,
    "Invalid qos",
  );
  assertThrows(
    () =>
      decode(
        Uint8Array.from([
          // fixedHeader
          0x82, // packetType + flags
          14, // remainingLength
          // variableHeader
          0, // id MSB
          1, // id LSB
          // payload
          0, // topic filter length MSB
          3, // topic filter length LSB
          97, // 'a'
          47, // '/'
          98, // 'b'
          0, // qos
          0, // topic filter length MSB
          3, // topic filter length LSB
          99, // 'c'
        ]),
      ),
    Error,
    "too short",
  );
  assertThrows(
    () =>
      decode(
        Uint8Array.from([
          // fixedHeader
          0x82, // packetType + flags
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

Deno.test("decode Subscribe packet invalid packet id with QoS > 0", () => {
  assertThrows(
    () =>
      decode(
        Uint8Array.from([
          // fixedHeader
          0x82, // packetType + flags
          13, // remainingLength
          // variableHeader
          0, // id MSB
          0, // id LSB
          // payload
          0, // topic filter length MSB
          3, // topic filter length LSB
          97, // 'a'
          47, // '/'
          98, // 'b'
          0, // qos
          0, // topic filter length MSB
          2, // topic filter length LSB
          99, // 'c'
          47, // '/'
          1, // qos
        ]),
      ),
    Error,
    "Invalid packet identifier",
  );
  assertThrows(
    () =>
      decode(
        Uint8Array.from([
          // fixedHeader
          0x82, // packetType + flags
          13, // remainingLength
          // variableHeader
          0, // id MSB
          0, // id LSB
          // payload
          0, // topic filter length MSB
          3, // topic filter length LSB
          97, // 'a'
          47, // '/'
          98, // 'b'
          0, // qos
          0, // topic filter length MSB
          2, // topic filter length LSB
          99, // 'c'
          47, // '/'
          2, // qos
        ]),
      ),
    Error,
    "Invalid packet identifier",
  );
});
