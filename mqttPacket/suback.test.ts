import assert from "node:assert/strict";
import { test } from "node:test";
import { decode, encode, MQTTLevel, PacketType, ReasonCode } from "./mod.ts";
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

test("encode/decode Suback v4", () => {
  const packet = {
    type: PacketType.suback,
    protocolLevel: MQTTLevel.v4,
    id: 1,
    returnCodes: [0, 1],
  };
  const encoded = encode(packet, codecOptsV4);
  assert.deepStrictEqual(
    encoded,
    Uint8Array.from([
      // fixedHeader
      0x90, // packetType + flags
      4, // remainingLength
      // variableHeader
      0, // id MSB
      1, // id LSB
      // payload
      0,
      1,
    ]),
  );
  const decoded = decode(encoded, codecOptsV4);
  assert.deepStrictEqual(decoded, packet);
});

test("encode/decode Suback v5", () => {
  const packet = {
    type: PacketType.suback,
    protocolLevel: MQTTLevel.v5,
    id: 1,
    reasonCodes: [ReasonCode.grantedQos0, ReasonCode.grantedQos1],
    properties: {
      reasonString: "reason",
      userProperty: [["test", "test"]],
    },
  };
  const encoded = encode(packet, codecOptsV5);
  assert.deepStrictEqual(
    encoded,
    Uint8Array.from([
      // fixedHeader
      144, // packetType + flags
      27, // remaining length
      0, // id MSB
      1, // id LSB
      22, // propertysize
      31, // reason string
      0, // string length MSB
      6, // string length LSB
      114, // r
      101, // e
      97, // a
      115, // s
      111, // o
      110, // n
      38, // user property
      0, // string length MSB
      4, // string length LSB
      116, // t
      101, // e
      115, // s
      116, // t
      0, // string length MSB
      4, // string length LSB
      116, // t
      101, // e
      115, // s
      116, // t
      0, // return code
      1, // return code
    ]),
  );
  const decoded = decode(encoded, codecOptsV5);
  assert.deepStrictEqual(decoded, packet);
});
