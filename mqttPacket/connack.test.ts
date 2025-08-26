import assert from "node:assert/strict";
import { test } from "node:test";
import { PacketType } from "./PacketType.ts";
import { decode, encode, MQTTLevel } from "./mod.ts";
import type { CodecOpts } from "./mod.ts";
import type { ConnackPacket } from "./connack.ts";

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

test("encode Connack packet", () => {
  assert.deepStrictEqual(
    encode({
      type: PacketType.connack,
      sessionPresent: false,
      returnCode: 0,
    }, codecOptsV4),
    Uint8Array.from([
      // fixedHeader
      0x20, // packetType + flags
      2, // remainingLength
      // variableHeader
      0, // connack flags
      0, // return code
    ]),
  );
});

test("decode Connack packet", () => {
  assert.deepStrictEqual(
    decode(
      Uint8Array.from([
        // fixedHeader
        0x20, // packetType + flags
        2, // remainingLength
        // variableHeader
        0, // connack flags
        0, // return code
      ]),
      codecOptsV4,
    ),
    {
      protocolLevel: 4,
      type: PacketType.connack,
      sessionPresent: false,
      returnCode: 0,
    },
  );
});

test("encode Connack with session present", () => {
  assert.deepStrictEqual(
    encode({
      type: PacketType.connack,
      protocolLevel: 4,
      sessionPresent: true,
      returnCode: 0,
    }, codecOptsV4),
    Uint8Array.from([
      // fixedHeader
      0x20, // packetType + flags
      2, // remainingLength
      // variableHeader
      1, // connack flags (sessionPresent)
      0, // return code
    ]),
  );
});

test("decode Connack with session present", () => {
  assert
    .deepStrictEqual(
      decode(
        Uint8Array.from([
          // fixedHeader
          0x20, // packetType + flags
          2, // remainingLength
          // variableHeader
          1, // connack flags (sessionPresent)
          0, // return code
        ]),
        codecOptsV4,
      ),
      {
        type: PacketType.connack,
        protocolLevel: 4,
        sessionPresent: true,
        returnCode: 0,
      },
    );
});

test("decode Connack with non-zero returnCode", () => {
  assert.deepStrictEqual(
    decode(
      Uint8Array.from([
        // fixedHeader
        0x20, // packetType + flags
        2, // remainingLength
        // variableHeader
        0, // connack flags
        4, // return code (bad username or password)
      ]),
      codecOptsV4,
    ),
    {
      protocolLevel: 4,
      type: PacketType.connack,
      sessionPresent: false,
      returnCode: 4,
    },
  );
});

test("decode Connack with invalid returnCode", () => {
  assert.throws(
    () =>
      decode(
        Uint8Array.from([
          // fixedHeader
          0x20, // packetType + flags
          2, // remainingLength
          // variableHeader
          0, // connack flags
          64, // return code (reserved)
        ]),
        codecOptsV4,
      ),
    /Invalid return code/,
  );
});

test("decode short Connack packets", () => {
  assert.throws(
    () => decode(Uint8Array.from([0x20]), codecOptsV4),
    /decoding failed/,
  );
  assert.throws(
    () => decode(Uint8Array.from([0x20, 2]), codecOptsV4),
    /Packet too short/,
  );
  assert.throws(
    () => decode(Uint8Array.from([0x20, 2, 0]), codecOptsV4),
    /Packet too long/,
  );
});

test("encode/decode connack v5", () => {
  const packet: ConnackPacket = {
    protocolLevel: 5,
    type: PacketType.connack,
    sessionPresent: false,
    reasonCode: 0x01,
    properties: {
      userProperty: [["key", "value"]],
    },
  };
  const encoded = encode(packet, codecOptsV5);
  const decoded = decode(encoded, codecOptsV5);
  assert.deepStrictEqual(decoded, packet);
});

test("encode/decode connack v5 as v4", () => {
  const packet: ConnackPacket = {
    protocolLevel: 5,
    type: PacketType.connack,
    sessionPresent: false,
    reasonCode: 0x01,
    properties: {
      userProperty: [["key", "value"]],
    },
  };
  const encoded = encode(packet, codecOptsV4);
  assert.throws(
    () => decode(encoded, codecOptsV4),
    /Packet too long/,
  );
});
