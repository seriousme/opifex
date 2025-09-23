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

const codecOptsUnknown: CodecOpts = {
  protocolLevel: MQTTLevel.unknown,
  maxIncomingPacketSize: 0xffff,
  maxOutgoingPacketSize: 0xffff,
};

import type { ConnectPacket } from "./mod.ts";

test("encode Connect with ClientId", () => {
  assert.deepStrictEqual(
    encode({
      type: PacketType.connect,
      protocolLevel: MQTTLevel.v4,
      clientId: "id",
    }, codecOptsUnknown),
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
      protocolLevel: MQTTLevel.v4,
      clientId: "id",
      clean: false,
    }, codecOptsUnknown),
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
      protocolLevel: MQTTLevel.v4,
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
  protocolLevel: MQTTLevel.v4,
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
      protocolLevel: MQTTLevel.v4,
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

test("encode/decode short Connect V5 with defaults and bridgeMode", () => {
  const packet = {
    type: PacketType.connect,
    protocolLevel: MQTTLevel.v5,
    bridgeMode: true,
  };
  const encoded = encode(packet, codecOptsUnknown);
  assert.deepStrictEqual(
    encoded,
    Uint8Array.from([
      // fixedHeader
      16, // packetType + flags
      13, // remainingLength
      // variableHeader
      0, // protocolNameLength MSB
      4, // protocolNameLength LSB
      77, // 'M'
      81, // 'Q'
      84, // 'T'
      84, // 'T'
      133, // protocolLevel
      2, // connectFlags (cleanSession)
      0, // keepAlive MSB
      0, // keepAlive LSB
      // payload
      // clientId
      0, // length MSB
      0, // length LSB
      0, // properties length
    ]),
  );
  const decoded = decode(encoded, codecOptsUnknown);
  const expected = {
    clean: true,
    clientId: "",
    keepAlive: 0,
    password: undefined,
    properties: {},
    protocolLevel: MQTTLevel.v5,
    protocolName: "MQTT",
    type: PacketType.connect,
    username: undefined,
    will: undefined,
    bridgeMode: true,
  };
  assert.deepStrictEqual(decoded, expected);
});

test("encode/decode short Connect V5 with defaults", () => {
  const packet = {
    type: PacketType.connect,
    protocolLevel: MQTTLevel.v5,
  };
  const encoded = encode(packet, codecOptsUnknown);
  assert.deepStrictEqual(
    encoded,
    Uint8Array.from([
      // fixedHeader
      16, // packetType + flags
      13, // remainingLength
      // variableHeader
      0, // protocolNameLength MSB
      4, // protocolNameLength LSB
      77, // 'M'
      81, // 'Q'
      84, // 'T'
      84, // 'T'
      5, // protocolLevel
      2, // connectFlags (cleanSession)
      0, // keepAlive MSB
      0, // keepAlive LSB
      // payload
      // clientId
      0, // length MSB
      0, // length LSB
      0, // properties length
    ]),
  );
  const decoded = decode(encoded, codecOptsUnknown);
  const expected = {
    clean: true,
    clientId: "",
    keepAlive: 0,
    password: undefined,
    properties: {},
    protocolLevel: MQTTLevel.v5,
    protocolName: "MQTT",
    type: PacketType.connect,
    username: undefined,
    will: undefined,
  };
  assert.deepStrictEqual(decoded, expected);
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
    "Packet too long",
  );

  // Test packet with invalid reserved bit
  const reservedBitConnect = [...encodedConnect];
  reservedBitConnect[9] += 1; // set bit 0 of flags

  assert.throws(
    () => decode(Uint8Array.from(reservedBitConnect), codecOptsUnknown),
    /Invalid reserved bit/,
    "Invalid reserved bit",
  );

  // Test packet with invalid will
  const invalidWillQosConnect = [...encodedConnectWithWill];
  invalidWillQosConnect[9] += 16; // set bit 4 of flags
  // Test packet with wrong protocol name 'MQTA'
  const invalidProtocolName = [...encodedConnect];
  invalidProtocolName[7] = 65; // 'A' instead of 'T'

  assert.throws(
    () => decode(Uint8Array.from(invalidProtocolName), codecOptsUnknown),
    /Invalid protocol name/,
    "Invalid protocol name",
  );

  // Test packet with wrong protocol name length
  const invalidProtocolLength = [...encodedConnect];
  invalidProtocolLength[3] = 5; // Length 5 instead of

  assert.throws(
    () => decode(Uint8Array.from(invalidProtocolLength), codecOptsUnknown),
    /Invalid protocol name or level/,
    "incorrect protocol name length",
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
    /Invalid protocol name or level/,
    "Invalid protocol name",
  );

  const invalidProtocolLevel = [...encodedConnect];
  invalidProtocolLevel[9] = 1;

  assert.throws(
    () =>
      decode(
        Uint8Array.from(invalidProtocolNameLevel5),
        codecOptsUnknown,
      ),
    /Invalid protocol name or level/,
    "Invalid protocol level",
  );

  assert.throws(
    () =>
      decode(
        Uint8Array.from(invalidWillQosConnect),
        codecOptsUnknown,
      ),
    /Invalid will qos/,
    "Invalid will qos",
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
    /Packet too short/,
    "Packet too short 2",
  );
});

test("encode MQTTv4, clean=false,  no clientId", () => {
  assert.throws(
    () =>
      encode({
        type: PacketType.connect,
        protocolLevel: MQTTLevel.v4,
        clean: false,
      }, codecOptsUnknown),
    /Client id required for clean session/,
  );
});

test("encode MQTTv3, no clientId", () => {
  assert.throws(
    () =>
      encode({
        type: PacketType.connect,
        protocolLevel: 3,
      }, codecOptsUnknown),
    /Client id required for protocol level 3/,
  );
});

test("decode MQTTv3, protocolname MQTT", () => {
  assert.throws(
    () =>
      decode(
        Uint8Array.from([
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
        ]),
        codecOptsUnknown,
      ),
    /Invalid protocol name/,
  );
});

test("encode/decode MQTTv5", () => {
  const packet: ConnectPacket = {
    type: PacketType.connect,
    protocolName: "MQTT",
    protocolLevel: 5,
    username: undefined,
    password: undefined,
    will: {
      retain: true,
      qos: 2,
      properties: {
        willDelayInterval: 1234,
        payloadFormatIndicator: false,
        messageExpiryInterval: 4321,
        contentType: "test",
        responseTopic: "topic",
        correlationData: Uint8Array.from([1, 2, 3, 4]),
        userProperty: [["test", "test"]],
      },
      topic: "topic",
      payload: Uint8Array.from([4, 3, 2, 1]),
    },
    clean: true,
    keepAlive: 30,
    properties: {
      sessionExpiryInterval: 1234,
      receiveMaximum: 432,
      maximumPacketSize: 100,
      topicAliasMaximum: 133,
      requestResponseInformation: true,
      requestProblemInformation: true,
      userProperty: [["test", "test"]],
      authenticationMethod: "test",
      authenticationData: Uint8Array.from([1, 2, 3, 4]),
    },
    clientId: "test",
  };

  const buf = Uint8Array.from([
    16,
    125, // Header
    0,
    4, // Protocol ID length
    77,
    81,
    84,
    84, // Protocol ID
    5, // Protocol version
    54, // Connect flags
    0,
    30, // Keepalive
    47, // properties length
    17, // sessionExpiryInterval, 4 bytes
    0,
    0,
    4,
    210,
    21, // authenticationMethod, string 4 char
    0,
    4,
    116,
    101,
    115,
    116,
    22, // authenticationData, string 4 char
    0,
    4,
    1,
    2,
    3,
    4,
    23, // requestProblemInformation, boolean
    1,
    25, // requestResponseInformation, boolean
    1,
    33, // receiveMaximum 2 bytes
    1,
    176,
    34, // topicAliasMaximum 2 byte
    0,
    133,
    38,
    0,
    4,
    116,
    101,
    115,
    116,
    0,
    4,
    116,
    101,
    115,
    116,
    39, // maximumPacketSize 4 bytes
    0,
    0,
    0,
    100,
    0,
    4,
    116,
    101,
    115,
    116,
    47,
    1,
    0,
    2,
    0,
    0,
    16,
    225,
    3,
    0,
    4,
    116,
    101,
    115,
    116,
    8,
    0,
    5,
    116,
    111,
    112,
    105,
    99,
    9,
    0,
    4,
    1,
    2,
    3,
    4,
    24,
    0,
    0,
    4,
    210,
    38, // userProperties, stringpair 2x 4 bytes
    0,
    4,
    116,
    101,
    115,
    116,
    0,
    4,
    116,
    101,
    115,
    116,
    0, // will topic
    5,
    116,
    111,
    112,
    105,
    99,
    0, // will payload
    4,
    4,
    3,
    2,
    1,
  ]);
  const encoded = encode(packet, codecOptsUnknown);
  assert.deepStrictEqual(buf, encoded);
  assert.deepStrictEqual(decode(encoded, codecOptsUnknown), packet);
});

test("encode/decode minimal connect MQTTv5", () => {
  const packet = {
    type: PacketType.connect,
    keepAlive: 60,
    clientId: "Opifex-38417844-2161-4c40-a88f-0fe232891607",
    protocolLevel: MQTTLevel.v5,
    username: undefined,
    password: undefined,
    clean: false,
  };

  const expected = {
    ...packet,
    protocolName: "MQTT",
    will: undefined,
    properties: {},
  };

  const buf = Uint8Array.from([
    16,
    56,
    0,
    4,
    77,
    81,
    84,
    84,
    5,
    0,
    0,
    60,
    0,
    0,
    43,
    79,
    112,
    105,
    102,
    101,
    120,
    45,
    51,
    56,
    52,
    49,
    55,
    56,
    52,
    52,
    45,
    50,
    49,
    54,
    49,
    45,
    52,
    99,
    52,
    48,
    45,
    97,
    56,
    56,
    102,
    45,
    48,
    102,
    101,
    50,
    51,
    50,
    56,
    57,
    49,
    54,
    48,
    55,
  ]);
  const encoded = encode(packet, codecOptsUnknown);
  assert.deepStrictEqual(buf, encoded);
  const decoded = decode(encoded, codecOptsUnknown);
  assert.deepStrictEqual(decoded, expected);
});
