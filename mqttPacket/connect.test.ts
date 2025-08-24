import { PacketType } from "./PacketType.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { decode, encode, MQTTLevel } from "./mod.ts";
import type { CodecOpts } from "./mod.ts";

const codecOptsV4: CodecOpts = {
  protocolLevel: MQTTLevel.v4,
  maxIncomingPacketSize: 0xffff,
};

const codecOptsUnknown: CodecOpts = {
  protocolLevel: MQTTLevel.unknown,
  maxIncomingPacketSize: 0xffff,
};

import type { ConnectPacket } from "./mod.ts";

test("encode Connect with ClientId", () => {
  assert.deepStrictEqual(
    encode({
      type: PacketType.connect,
      clientId: "id",
    }, codecOptsV4),
    Uint8Array.from([
      // fixedHeader
      16, // packetType + flags
      14, // remainingLength
      // variableHeader
      0, // protocolNameLength MSB
      4, // protocolNameLength LSB
      77, // 'M'
      81, // 'Q'
      84, // 'T'
      84, // 'T'
      4, // protocolLevel
      2, // connectFlags (cleanSession)
      0, // keepAlive MSB
      0, // keepAlive LSB
      // payload
      // clientId
      0, // length MSB
      2, // length LSB
      105, // 'i'
      100, // 'd'
    ]),
  );
});

test("encode Connect with Clean false", () => {
  assert.deepStrictEqual(
    encode({
      type: PacketType.connect,
      clientId: "id",
      clean: false,
    }, codecOptsV4),
    Uint8Array.from([
      // fixedHeader
      16, // packetType + flags
      14, // remainingLength
      // variableHeader
      0, // protocolNameLength MSB
      4, // protocolNameLength LSB
      77, // 'M'
      81, // 'Q'
      84, // 'T'
      84, // 'T'
      4, // protocolLevel
      0, // connectFlags
      0, // keepAlive MSB
      0, // keepAlive LSB
      // payload
      // clientId
      0, // length MSB
      2, // length LSB
      105, // 'i'
      100, // 'd'
    ]),
  );
});

test("encode Connect with KeepAlive", () => {
  assert.deepStrictEqual(
    encode({
      type: PacketType.connect,
      clientId: "id",
      keepAlive: 300,
    }, codecOptsV4),
    Uint8Array.from([
      // fixedHeader
      16, // packetType + flags
      14, // remainingLength
      // variableHeader
      0, // protocolNameLength MSB
      4, // protocolNameLength LSB
      77, // 'M'
      81, // 'Q'
      84, // 'T'
      84, // 'T'
      4, // protocolLevel
      2, // connectFlags (cleanSession)
      1, // keepAlive MSB
      44, // keepAlive LSB
      // payload
      // clientId
      0, // length MSB
      2, // length LSB
      105, // 'i'
      100, // 'd'
    ]),
  );
});

const encodedConnect = [
  // fixedHeader
  16, // packetType + flags
  26, // remainingLength
  // variableHeader
  0, // protocolNameLength MSB
  4, // protocolNameLength LSB
  77, // 'M'
  81, // 'Q'
  84, // 'T'
  84, // 'T'
  4, // protocolLevel
  194, // connectFlags (usernameFlag, passwordFlag, cleanSession)
  0, // keepAlive MSB
  0, // keepAlive LSB
  // payload
  // clientId
  0, // length MSB
  2, // length LSB
  105, // 'i'
  100, // 'd'
  // username
  0, // length MSB
  4, // length LSB
  117, // 'u'
  115, // 's'
  101, // 'e'
  114, // 'r'
  // password
  0, // length MSB
  4, // length LSB
  112, // 'p'
  97, // 'a'
  115, // 's'
  115, // 's'
];

const decodedConnect: ConnectPacket = {
  type: PacketType.connect,
  clientId: "id",
  protocolName: "MQTT",
  protocolLevel: 4,
  username: "user",
  password: Uint8Array.from([
    112, // 'p'
    97, // 'a'
    115, // 's'
    115, // 's'
  ]),
  will: undefined,
  clean: true,
  keepAlive: 0,
};

test("encode Connect with username and password", () => {
  assert.deepStrictEqual(
    encode({
      type: PacketType.connect,
      clientId: "id",
      username: "user",
      password: Uint8Array.from([
        112, // 'p'
        97, // 'a'
        115, // 's'
        115, // 's'
      ]),
    }, codecOptsV4),
    Uint8Array.from(encodedConnect),
  );
});

test("decode Connect with username and password", () => {
  assert.deepStrictEqual(
    decode(Uint8Array.from(encodedConnect), codecOptsUnknown),
    decodedConnect,
  );
});

const decodedConnectWithWill = Object.assign({}, decodedConnect);
decodedConnectWithWill.will = {
  topic: "mywill",
  payload: Uint8Array.from([
    77, // 'M'
    81, // 'Q'
    84, // 'T'
    84, // 'T'
  ]),
  retain: false,
  qos: 1,
};

const encodedConnectWithWill = [
  // fixedHeader
  16, // packetType + flags
  40, // remainingLength
  // variableHeader
  0, // protocolNameLength MSB
  4, // protocolNameLength LSB
  77, // 'M'
  81, // 'Q'
  84, // 'T'
  84, // 'T'
  4, // protocolLevel
  206, // connectFlags (usernameFlag, passwordFlag, cleanSession, hasWill, willretain, willQos)
  0, // keepAlive MSB
  0, // keepAlive LSB
  // payload
  // clientId
  0, // length MSB
  2, // length LSB
  105, // 'i'
  100, // 'd'
  // will topic
  0, // length MSB
  6, // length LSB
  109, // 'm'
  121, // 'y'
  119, // 'w'
  105, // 'i'
  108, // 'l'
  108, // 'l'
  // will payload (raw bytes)
  0, // length MSB
  4, // length LSB
  77, // 'M'
  81, // 'Q'
  84, // 'T'
  84, // 'T'
  // username
  0, // length MSB
  4, // length LSB
  117, // 'u'
  115, // 's'
  101, // 'e'
  114, // 'r'
  // password
  0, // length MSB
  4, // length LSB
  112, // 'p'
  97, // 'a'
  115, // 's'
  115, // 's'
];

test("encode Connect with username and password and will", () => {
  assert.deepStrictEqual(
    encode(decodedConnectWithWill, codecOptsUnknown),
    Uint8Array.from(encodedConnectWithWill),
  );
});

test("decode invalid Connect", () => {
  // Test packet with extra byte
  const longConnect = [...encodedConnect, 0];
  longConnect[1]++;

  assert.throws(
    () => decode(Uint8Array.from([...longConnect]), codecOptsUnknown),
    /Packet too long/,
  );

  // Test packet with invalid reserved bit
  const reservedBitConnect = [...encodedConnect];
  reservedBitConnect[9] += 1; // set bit 0 of flags

  assert.throws(
    () => decode(Uint8Array.from(reservedBitConnect), codecOptsUnknown),
   /Invalid reserved bit/
  );

  // Test packet with invalid will
  const invalidWillQosConnect = [...encodedConnectWithWill];
  invalidWillQosConnect[9] += 16; // set bit 4 of flags
  // Test packet with wrong protocol name 'MQTA'
  const invalidProtocolName = [...encodedConnect];
  invalidProtocolName[7] = 65; // 'A' instead of 'T'

  assert.throws(
    () => decode(Uint8Array.from(invalidProtocolName), codecOptsUnknown),
    /Invalid protocol name/
  );

  // Test packet with wrong protocol name length
  const invalidProtocolLength = [...encodedConnect];
  invalidProtocolLength[3] = 5; // Length 5 instead of

  assert.throws(
    () => decode(Uint8Array.from(invalidProtocolLength), codecOptsUnknown),
    /Packet too short/
  );

  // Test packet with protocol level 5 and protocol name MQIsdp
  const invalidProtocolNameLevel5 = [...invalidProtocolName];
  invalidProtocolNameLevel5[9] = 5;

  assert.throws(
    () =>
      decode(
        Uint8Array.from(invalidProtocolNameLevel5),
        codecOptsUnknown,
      ),
    /Invalid protocol name/,
  );

  assert.throws(
    () =>
      decode(
        Uint8Array.from(invalidWillQosConnect),
        codecOptsUnknown,
      ),
    /Invalid will qos/
  );

  assert.throws(
    () =>
      decode(
        Uint8Array.from([
          // fixedHeader
          16, // packetType + flags + reserved bit set to 1
          26, // remainingLength
          // variableHeader
          0, // protocolNameLength MSB
          4, // protocolNameLength LSB
          77, // 'M'
          81, // 'Q'
          84, // 'T'
        ]),
        codecOptsUnknown,
      ),
    /Packet too short/
  );
});

test("encode MQTTv4, clean=false,  no clientId", () => {
  assert.throws(
    () =>
      encode({
        type: PacketType.connect,
        protocolLevel:4,
        clean:false
      }, codecOptsUnknown),
    /Client id required for clean session/,
  );
});

test("encode MQTTv3, no clientId", () => {
  assert.throws(
    () =>
      encode({
        type: PacketType.connect,
        protocolLevel:3
      }, codecOptsUnknown),
    /Client id required for protocol level 3/,
  );
});

test("decode MQTTv3, protocolname MQTT", () => {
  assert.throws(
    () =>
      decode(Uint8Array.from([
        // fixedHeader
        16, // packetType + flags
        26, // remainingLength
        // variableHeader
        0, // protocolNameLength MSB
        4, // protocolNameLength LSB
        77, // 'M'
        81, // 'Q'
        84, // 'T'
        84, // 'T'
        3, // protocolLevel
        2, // connectFlags (cleanSession)
        0, // keepAlive MSB
        0, // keepAlive LSB
        // payload
        // clientId
        0, // length MSB
        2, // length LSB
        105, // 'i'
        100, // 'd'
      ]), codecOptsUnknown),
    /Invalid protocol name/,
  );
});

test("decode MQTTv5, protocolname MQT", () => {
  assert.throws(
    () =>
      decode(Uint8Array.from([
        // fixedHeader
        16, // packetType + flags
        26, // remainingLength
        // variableHeader
        0, // protocolNameLength MSB
        3, // protocolNameLength LSB
        77, // 'M'
        81, // 'Q'
        84, // 'T'
        5, // protocolLevel
        2, // connectFlags (cleanSession)
        0, // keepAlive MSB
        0, // keepAlive LSB
        // payload
        // clientId
        0, // length MSB
        2, // length LSB
        105, // 'i'
        100, // 'd'
      ]), codecOptsUnknown),
    /Invalid protocol name/,
  );
});

test("encode MQTTv5", () => {
  assert.throws(
    () =>
      encode({
        type: PacketType.connect,
        protocolLevel:5
      }, codecOptsUnknown),
    /Unsupported protocol level/,
  );
});


