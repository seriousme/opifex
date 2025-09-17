import { PacketType } from "./PacketType.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

import { decode, encode, MQTTLevel, RetainHandling } from "./mod.ts";
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

test("encode/decode Subscribe v4", () => {
  const packet = {
    type: PacketType.subscribe,
    protocolLevel: MQTTLevel.v4,
    id: 1,
    subscriptions: [
      { topicFilter: "a/b", qos: 0 },
      { topicFilter: "c/d", qos: 1 },
    ],
  };
  const encoded = encode(packet, codecOptsV4);
  assert.deepStrictEqual(
    encoded,
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
  const decoded = decode(encoded, codecOptsV4);
  assert.deepStrictEqual(decoded, packet);
});

test("encode/decode Subscribe v5", () => {
  const packet = {
    type: PacketType.subscribe,
    protocolLevel: MQTTLevel.v5,
    id: 1,
    subscriptions: [
      { topicFilter: "a/b", qos: 0 },
      {
        topicFilter: "c/d",
        qos: 2,
        noLocal: true,
        retainAsPublished: true,
        retainHandling: RetainHandling.noRetain,
      },
    ],
    properties: {
      subscriptionIdentifier: 123,
    },
  };
  const encoded = encode(packet, codecOptsV5);
  assert.deepStrictEqual(
    encoded,
    Uint8Array.from([
      // fixedHeader
      0x82, // packetType + flags
      17, // remainingLength
      // variableHeader
      0, // id MSB
      1, // id LSB
      2, // propertyLength
      11, // subscription identifier
      123, // 123
      // payload
      0, // topic filter length MSB
      3, // topic filter length LSB
      97, // 'a'
      47, // '/'
      98, // 'b'
      0, // options
      0, // topic filter length MSB
      3, // topic filter length LSB
      99, // 'c'
      47, // '/'
      100, // 'd'
      46, // options 0b101110
    ]),
  );
  const decoded = decode(encoded, codecOptsV5);
  // add the defaults for comparison
  const packetWithDefaults = {
    ...packet,
    subscriptions: [
      {
        ...packet.subscriptions[0],
        noLocal: false,
        retainAsPublished: false,
        retainHandling: RetainHandling.sendRetained,
      },
      { ...packet.subscriptions[1] },
    ],
  };
  assert.deepStrictEqual(decoded, packetWithDefaults);
});

test("decode Subscribe v4 missing bit 1 flag", () => {
  assert.throws(
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
        codecOptsV4,
      ),
    Error,
    "Invalid header",
  );
});

test("decode Subscribe packet too short", () => {
  assert.throws(
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
        codecOptsV4,
      ),
    Error,
    "Invalid qos",
  );
  assert.throws(
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
        codecOptsV4,
      ),
    Error,
    "too short",
  );
  assert.throws(
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
        codecOptsV4,
      ),
    Error,
    "too short",
  );
});

test("decode Subscribe packet invalid packet id with QoS > 0", () => {
  assert.throws(
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
        codecOptsV4,
      ),
    Error,
    "Invalid packet identifier",
  );
  assert.throws(
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
        codecOptsV4,
      ),
    Error,
    "Invalid packet identifier",
  );
});

test("decode Subscribe v5 with invalid subscription options", () => {
  for (
    const item of [
      [0b10000000, /Invalid subscription options/], // bit 7 must be 0
      [0b1000000, /Invalid subscription options/], // bit 6 must be 0
      [0b110000, /Invalid retain handling/], // retain handling can't be 3
      [0b100011, /Invalid qos/], // qos can't be 3
    ]
  ) {
    const [options, err] = item as [number, RegExp];
    assert.throws(
      () =>
        decode(
          Uint8Array.from([
            // fixedHeader
            0x82, // packetType + flags
            9, // remainingLength
            // variableHeader
            0, // id MSB
            1, // id LSB
            0, // propertyLength
            // payload
            0, // topic filter length MSB
            3, // topic filter length LSB
            97, // 'a'
            47, // '/'
            98, // 'b'
            options, // options
          ]),
          codecOptsV5,
        ),
      err,
      "Invalid subscription options",
    );
  }
});
