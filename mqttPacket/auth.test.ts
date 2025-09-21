import assert from "node:assert/strict";
import { test } from "node:test";
import { decode, encode, MQTTLevel, PacketType, ReasonCode } from "./mod.ts";
import type { AuthPacket, CodecOpts } from "./mod.ts";

const codecOptsV5: CodecOpts = {
  protocolLevel: MQTTLevel.v5,
  maxIncomingPacketSize: 0xffff,
  maxOutgoingPacketSize: 0xffff,
};

const codecOptsV4: CodecOpts = {
  protocolLevel: MQTTLevel.v4,
  maxIncomingPacketSize: 0xffff,
  maxOutgoingPacketSize: 0xffff,
};

test("decode Auth V5 with invalid reasonCode", () => {
  assert.throws(
    () =>
      decode(
        Uint8Array.from([
          // fixedHeader
          0x20, // packetType + flags
          2, // remainingLength
          // variableHeader
          0, // reason code
          64, // (reserved)
        ]),
        codecOptsV5,
      ),
    /Invalid reason code/,
  );
});

test("decode Auth V5 as V4", () => {
  assert.throws(
    () =>
      decode(
        Uint8Array.from([
          // fixedHeader
          0xf0, // packetType + flags
          2, // remainingLength
          // variableHeader
          0, // reason code
          0, // properties length
        ]),
        codecOptsV4,
      ),
    /Invalid protocol level/,
  );
});

test("encode/decode minimal auth V5", () => {
  const packet = {
    protocolLevel: MQTTLevel.v5,
    type: PacketType.auth,
    reasonCode: ReasonCode.success,
  };
  const encoded = encode(packet, codecOptsV5);
  assert.deepStrictEqual(
    encoded,
    Uint8Array.from([
      // fixedHeader

      0xf0, // auth packet + flags
      2, // remaining length
      0, // reason code
      0, // property length
    ]),
  );
  const decoded = decode(encoded, codecOptsV5);
  assert.deepStrictEqual(decoded, { ...packet, properties: {} });
});

test("encode/decode auth V5", () => {
  const packet: AuthPacket = {
    protocolLevel: 5,
    type: PacketType.auth,
    reasonCode: ReasonCode.continueAuthentication,
    properties: {
      userProperty: [["key", "value"]],
    },
  };
  const encoded = encode(packet, codecOptsV5);
  assert.deepStrictEqual(
    encoded,
    Uint8Array.from([
      // fixedHeader

      0xf0, // auth packet + flags
      15, // remaining length
      24, // reason code
      13, // property length
      38, // user property
      0, // string MSB
      3, // string LSB
      107, // k
      101, // e
      121, // y
      0, // string MSB
      5, // string LSB
      118, // v
      97, // a
      108, // l
      117, // u
      101, // e
    ]),
  );
  const decoded = decode(encoded, codecOptsV5);
  assert.deepStrictEqual(decoded, packet);
});
