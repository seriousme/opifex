import assert from "node:assert/strict";
import { test } from "node:test";

import { Encoder } from "./encoder.ts";
import { Decoder } from "./decoder.ts";
import { decodeProperties, encodeProperties } from "./properties.ts";
import { PacketType } from "./PacketType.ts";

test("encodeProperties encodes allowed properties for connect", () => {
  const encoder = new Encoder(PacketType.connect);
  const props = {
    sessionExpiryInterval: 60,
    authenticationMethod: "basic",
    authenticationData: new Uint8Array([1, 2, 3]),
    requestProblemInformation: true,
    requestResponseInformation: false,
    receiveMaximum: 100,
    topicAliasMaximum: 10,
    userProperty: [["key", "value"]],
    maximumPacketSize: 1024,
  };
  encodeProperties(props, PacketType.connect, encoder, 2048);
  assert.equal(encoder.encodedSize(), 53);
});

test("decodeProperties decodes allowed properties for connect", () => {
  const encoder = new Encoder(PacketType.connect);
  const props = {
    sessionExpiryInterval: 60,
    authenticationMethod: "basic",
    authenticationData: new Uint8Array([1, 2, 3]),
    requestProblemInformation: true,
    requestResponseInformation: false,
    receiveMaximum: 100,
    topicAliasMaximum: 10,
    userProperty: { key1: "value1", key2: "value2" },
    maximumPacketSize: 1024,
  };
  encodeProperties(props, PacketType.connect, encoder, 2048);
  const buf = encoder.done(0);
  // skip the first byte which contains the packet identifier
  const decoder = new Decoder(buf, 1);
  const decoded = decodeProperties(PacketType.connect, decoder);
  assert.equal(decoded.sessionExpiryInterval, 60);
  assert.equal(decoded.authenticationMethod, "basic");
  assert.deepEqual(decoded.authenticationData, new Uint8Array([1, 2, 3]));
  assert.equal(decoded.requestProblemInformation, true);
  assert.equal(decoded.requestResponseInformation, false);
  assert.equal(decoded.receiveMaximum, 100);
  assert.equal(decoded.topicAliasMaximum, 10);
  assert.deepEqual(decoded.userProperty, { key1: "value1", key2: "value2" });
  assert.equal(decoded.maximumPacketSize, 1024);
});

test("decodeProperties decodes allowed properties for connack", () => {
  const encoder = new Encoder(PacketType.connack);
  const props = {
    maximumQos: 2,
    reasonString: "very good reason",
  };
  encodeProperties(props, PacketType.connack, encoder, 2048);
  const buf = encoder.done(0);
  // skip the first byte which contains the packet identifier
  const decoder = new Decoder(buf, 1);
  const decoded = decodeProperties(PacketType.connack, decoder);
  assert.equal(decoded.maximumQos, 2);
});

test("encodeProperties does not encode properties not allowed for packet type", () => {
  const encoder = new Encoder(PacketType.publish);
  const props = {
    subscriptionIdentifier: 1,
    userProperty: [["key", "value"]],
    // Not allowed for publish
    sessionExpiryInterval: 60,
    authenticationMethod: "basic",
    authenticationData: new Uint8Array([1, 2, 3]),
    requestProblemInformation: true,
    requestResponseInformation: false,
    receiveMaximum: 100,
    topicAliasMaximum: 10,
    maximumPacketSize: 1024,
  };
  encodeProperties(props, PacketType.publish, encoder, 2048);
  const buf = encoder.done(0);
  const decoder = new Decoder(buf, 1);
  const decoded = decodeProperties(PacketType.publish, decoder);
  assert.deepStrictEqual(Object.keys(decoded), [
    "subscriptionIdentifier",
    "userProperty",
  ]);
});

test("decodeProperties throws on duplicate property", () => {
  const encoder = new Encoder(PacketType.publish);
  // Manually encode duplicate propertys
  encoder.setVariableByteInteger(0x01); // payloadFormatIndicator
  encoder.setByte(1);
  encoder.setVariableByteInteger(0x01); // payloadFormatIndicator again
  encoder.setByte(1);
  const buf = encoder.done(0);
  const decoder = new Decoder(buf, 1);
  assert.throws(
    () => decodeProperties(PacketType.publish, decoder),
    /Property payloadFormatIndicator only allowed once/,
  );
});

test("decodeProperties throws on property not allowed for packet type", () => {
  const encoder = new Encoder(PacketType.publish);
  encoder.setVariableByteInteger(0x13); // serverKeepAlive (not allowed for publish)
  encoder.setInt32(30);
  const buf = encoder.done(0);
  const decoder = new Decoder(buf, 1);
  assert.throws(
    () => decodeProperties(PacketType.publish, decoder),
    /Property type serverKeepAlive not allowed/,
  );
});

test("encodeProperties rewinds marker if encodedSize exceeds maximumPacketSize", () => {
  const encoder = new Encoder(PacketType.puback);
  const props = {
    reasonString: "reason",
    userProperty: [["key", "value"]],
  };
  encodeProperties(props, PacketType.puback, encoder, 10); // very small max size
  assert.equal(encoder.encodedSize(), 9);
});

test("encodeProperties removes all properties if encodedSize exceeds maximumPacketSize", () => {
  const encoder = new Encoder(PacketType.puback);
  const props = {
    reasonString: "a very long reason",
    userProperty: [["key", "value"]],
  };
  encodeProperties(props, PacketType.puback, encoder, 10); // very small max size
  assert.equal(encoder.encodedSize(), 0);
});

test("decodeProperty throws on invalid property kind", () => {
  const encoder = new Encoder(PacketType.publish);
  // Manually encode an invalid property kind
  encoder.setVariableByteInteger(0xFF); // Invalid property ID
  encoder.setByte(1);

  const buf = encoder.done(0);
  const decoder = new Decoder(buf, 1);

  assert.throws(
    () => decodeProperties(PacketType.publish, decoder),
    /Property type 255 not allowed/,
  );
});

test("userProperty must be an object", () => {
  const encoder = new Encoder(PacketType.puback);
  const props = {
    userProperty: "I am not an object",
  };
  assert.throws(
    () => encodeProperties(props, PacketType.puback, encoder, 10),
    / userProperty must be an object/,
  );
});
