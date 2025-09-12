import { PacketType } from "./PacketType.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

import { decode, encode, MQTTLevel } from "./mod.ts";
import type { CodecOpts } from "./mod.ts";

const codecOptsV4: CodecOpts = {
  protocolLevel: MQTTLevel.v4,
  maxIncomingPacketSize: 0xffff,
  maxOutgoingPacketSize: 0xffff,
};

const codecOptsV5: CodecOpts = {
  protocolLevel: MQTTLevel.v5,
  maxIncomingPacketSize: 0xffff,
  maxOutgoingPacketSize: 0xffff,
};

// const utf8Decoder = new TextDecoder();
const utf8Encoder = new TextEncoder();
const payload = utf8Encoder.encode("payload");

test("encode/decode short Publish v4", () => {
  const packet = {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    qos: 0,
    dup: false,
    id: 0,
    retain: false,
    topic: "a/b",
    payload,
  };
  const encoded = encode(packet, codecOptsV4);
  assert.deepStrictEqual(
    encoded,
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
  const decoded = decode(encoded, codecOptsV4);
  assert.deepStrictEqual(decoded, packet);
});

test("encode/decode extended Publish v4", () => {
  const packet = {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
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
  };
  const encoded = encode(packet, codecOptsV4);
  assert.deepStrictEqual(
    encoded,
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
  const decoded = decode(encoded, codecOptsV4);
  assert.deepStrictEqual(decoded, packet);
});

test("encode/decode Publish v4 no payload", () => {
  const packet = {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    dup: false,
    qos: 0,
    retain: false,
    id: 0,
    topic: "a/b",
    payload: Uint8Array.from([]),
  };
  const encoded = encode(packet, codecOptsV4);
  assert.deepStrictEqual(
    encoded,
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
  );
  const decoded = decode(encoded, codecOptsV4);
  assert.deepStrictEqual(decoded, packet);
});

test("Invalid qos", () => {
  assert.throws(
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
        codecOptsV4,
      ),
    Error,
    "Invalid qos",
  );
});

test("QoS 2, but no packetId", () => {
  assert.throws(
    () =>
      encode({
        type: PacketType.publish,
        protocolLevel: MQTTLevel.v4,
        topic: "a/b",
        payload,
        qos: 2,
      }, codecOptsV4),
    /when qos is 1 or 2, packet must have id/,
  );
});

test("encode/decode Publish v5", () => {
  const packet = {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v5,
    dup: false,
    qos: 0,
    retain: false,
    id: 0,
    topic: "a/b",
    payload,
    properties: {
      payloadFormatIndicator: true,
      messageExpiryInterval: 1234,
      contentType: "content",
      responseTopic: "response",
      correlationData: Uint8Array.from([1, 2, 3]),
      subscriptionIdentifier: 123,
      topicAlias: 123,
      userProperty: [["user", "property"]],
    },
  };
  const encoded = encode(packet, codecOptsV5);
  assert.deepStrictEqual(
    encoded,
    Uint8Array.from([
      // fixedHeader
      48, // packetType + flags
      69, // remainingLength
      0, // topic length MSB
      3, // topic length LSB
      97, // a
      47, // /
      98, // b
      56, // propertyLength
      1, // payload format indicator
      1, // true
      2, // message expiry interval (4 bytes)
      0,
      0,
      4,
      210,
      3, // content type
      0, // string length MSB
      7, // string length LSB
      99, // c
      111, // o
      110, // n
      116, // t
      101, // e
      110, // n
      116, // t
      8, // response topic
      0, // string length MSB
      8, // string length LSB
      114, // r
      101, // e
      115, // s
      112, // p
      111, // o
      110, // n
      115, // s
      101, // e
      9, // correlation data 3 bytes
      0, // byte length MSB
      3, // byte length LSB
      1,
      2,
      3,
      11, // subscriptionIdentifier
      123, // 123
      35, // topicAlias
      0,
      123,
      38, // userproperties
      0, // string length MSB
      4, // string length LSB
      117, // u
      115, // s
      101, // e
      114, // r
      0, // string length MSB
      8, // string length LSB
      112, // p
      114, // r
      111, // o
      112, // p
      101, // e
      114, // r
      116, // t
      121, // y
      112, // p
      97, // a
      121, // y
      108, // l
      111, // o
      97, // a
      100, // d
    ]),
  );
  const decoded = decode(encoded, codecOptsV5);
  assert.deepStrictEqual(decoded, packet);
});
