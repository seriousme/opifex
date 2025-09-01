import assert from "node:assert/strict";
import { test } from "node:test";

import { decode, encode, MQTTLevel, PacketType, ReasonCode } from "./mod.ts";
import type { CodecOpts, TPacketType, TReasonCode } from "./mod.ts";

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

const packetTypesToTest = [
  [PacketType.puback, "Puback", ReasonCode.packetIdentifierInUse],
  [PacketType.pubrec, "Pubrec", ReasonCode.packetIdentifierInUse],
  [PacketType.pubrel, "Pubrel", ReasonCode.packetIdentifierNotFound],
  [PacketType.pubcomp, "Pubcomp", ReasonCode.packetIdentifierNotFound],
];
for (const item of packetTypesToTest) {
  const [ackType, label, reasonCode] = item as [
    TPacketType,
    string,
    TReasonCode,
  ];
  const ackTypeByte = ackType << 4;
  test(`encode/decode ${label} v4`, () => {
    const packet = {
      type: ackType,
      protocolLevel: MQTTLevel.v4,
      id: 1337,
    };
    const encoded = encode(packet, codecOptsV4);
    assert.deepStrictEqual(
      encoded,
      Uint8Array.from([
        // fixedHeader
        ackTypeByte, // packetType + flags
        2, // remainingLength
        // variableHeader
        5, // id MSB
        57, // id LSB
      ]),
    );
    const decoded = decode(encoded, codecOptsV4);
    assert.deepStrictEqual(decoded, packet);
  });

  test(`encode/decode ${label} v5`, () => {
    const packet = {
      type: ackType,
      protocolLevel: MQTTLevel.v5,
      id: 1337,
      reasonCode,
      properties: { reasonString: "test" },
    };
    const encoded = encode(packet, codecOptsV5);
    assert.deepStrictEqual(
      encoded,
      Uint8Array.from([
        // fixedHeader
        ackTypeByte, // packetType + flags
        11, // remainingLength
        // variableHeader
        5, // id MSB
        57, // id LSB
        reasonCode, // reasonCode
        // properties
        7, // propertyLength
        31, // reasonString
        0, // string length MSB
        4, // string length LSB
        116, //'t'
        101, //'e'
        115, //'s'
        116, //'t'
      ]),
    );
    const decoded = decode(encoded, codecOptsV5);
    assert.deepStrictEqual(decoded, packet);
  });

  test(`encode/decode short ${label} v5`, () => {
    const packet = {
      type: ackType,
      protocolLevel: MQTTLevel.v5,
      id: 1337,
      reasonCode: 0,
    };
    const encoded = encode(packet, codecOptsV5);
    assert.deepStrictEqual(
      encoded,
      Uint8Array.from([
        // fixedHeader
        ackTypeByte, // packetType + flags
        2, // remainingLength
        // variableHeader
        5, // id MSB
        57, // id LSB
      ]),
    );
    const decoded = decode(encoded, codecOptsV5);
    assert.deepStrictEqual(decoded, packet);
  });

  test("decode short puback packets", () => {
    assert.throws(
      () => decode(Uint8Array.from([ackTypeByte]), codecOptsV4),
      Error,
      "decoding failed",
    );
    assert.throws(
      () => decode(Uint8Array.from([ackTypeByte, 3, 0, 0, 0]), codecOptsV4),
      Error,
      "too long",
    );
    assert.throws(
      () => decode(Uint8Array.from([ackTypeByte, 2, 5]), codecOptsV5),
      Error,
      "decoding failed",
    );
  });
}
