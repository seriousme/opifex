import assert from "node:assert/strict";
import { test } from "node:test";

import { Encoder } from "./encoder.ts";
import { Decoder, DecoderError } from "./decoder.ts";
import { PacketType } from "./PacketType.ts";

test("encoder.setProperties encodes allowed properties for connect", () => {
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
  encoder.setProperties(props, PacketType.connect, 2048);
  assert.equal(encoder.encodedSize(), 48);
});

test("decoder.getProperties decodes allowed properties for connect", () => {
  const encoder = new Encoder(PacketType.connect);
  const props = {
    sessionExpiryInterval: 60,
    authenticationMethod: "basic",
    authenticationData: new Uint8Array([1, 2, 3]),
    requestProblemInformation: true,
    requestResponseInformation: false,
    receiveMaximum: 100,
    topicAliasMaximum: 10,
    userProperty: [["key1", "value1"], ["key2", "value2"]],
    maximumPacketSize: 1024,
  };
  encoder.setProperties(props, PacketType.connect, 2048);
  const buf = encoder.done(0);
  // skip the first byte which contains the packet identifier
  // and the second byte that holds the packet length
  const decoder = new Decoder(PacketType.connect, buf, 2);
  const decoded = decoder.getProperties(PacketType.connect);
  assert.equal(decoded.sessionExpiryInterval, 60);
  assert.equal(decoded.authenticationMethod, "basic");
  assert.deepEqual(decoded.authenticationData, new Uint8Array([1, 2, 3]));
  assert.equal(decoded.requestProblemInformation, true);
  assert.equal(decoded.requestResponseInformation, false);
  assert.equal(decoded.receiveMaximum, 100);
  assert.equal(decoded.topicAliasMaximum, 10);
  assert.deepEqual(decoded.userProperty, [["key1", "value1"], [
    "key2",
    "value2",
  ]]);
  assert.equal(decoded.maximumPacketSize, 1024);
});

test("decoder.getProperties decodes allowed properties for connack", () => {
  const encoder = new Encoder(PacketType.connack);
  const props = {
    maximumQos: 2,
    reasonString: "very good reason",
  };
  encoder.setProperties(props, PacketType.connack, 2048);
  const buf = encoder.done(0);
  // skip the first byte which contains the packet identifier
  // and the second byte that holds the packet length
  const decoder = new Decoder(PacketType.connack, buf, 2);
  const decoded = decoder.getProperties(PacketType.connack);
  assert.equal(decoded.maximumQos, 2);
});

test("encoder.setProperties does not encode properties not allowed for packet type", () => {
  const encoder = new Encoder(PacketType.publish);
  const props = {
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
  encoder.setProperties(props, PacketType.publish, 2048);
  const buf = encoder.done(0);
  const decoder = new Decoder(PacketType.publish, buf, 2);
  const decoded = decoder.getProperties(PacketType.publish);
  assert.deepStrictEqual(Object.keys(decoded), [
    "userProperty",
  ]);
});

test("decoder.getProperties throws on duplicate property", () => {
  const encoder = new Encoder(PacketType.publish);
  // Manually encode duplicate properties
  encoder.setVariableByteInteger(0x04); // propertyLength
  encoder.setVariableByteInteger(0x01); // payloadFormatIndicator
  encoder.setByte(1);
  encoder.setVariableByteInteger(0x01); // payloadFormatIndicator again
  encoder.setByte(1);
  const buf = encoder.done(0);
  const decoder = new Decoder(PacketType.publish, buf, 2);
  assert.throws(
    () => decoder.getProperties(PacketType.publish),
    /Property payloadFormatIndicator only allowed once/,
  );
});

test("decoder.getProperties throws on property not allowed for packet type", () => {
  const encoder = new Encoder(PacketType.publish);
  encoder.setVariableByteInteger(0x05); // propertyLength
  encoder.setVariableByteInteger(0x13); // serverKeepAlive (not allowed for publish)
  encoder.setInt32(30);
  const buf = encoder.done(0);
  const decoder = new Decoder(PacketType.publish, buf, 2);
  assert.throws(
    () => decoder.getProperties(PacketType.publish),
    /Property type serverKeepAlive not allowed/,
  );
});

test("encoder.setProperties rewinds marker if encodedSize exceeds maximumPacketSize", () => {
  const encoder = new Encoder(PacketType.puback);
  const props = {
    reasonString: "small",
    userProperty: [["key", "value"]],
  };
  encoder.setProperties(props, PacketType.puback, 10); // very small max size
  assert.equal(encoder.encodedSize(), 9);
});

test("encoder.setProperties removes all properties if encodedSize exceeds maximumPacketSize", () => {
  const encoder = new Encoder(PacketType.puback);
  const props = {
    reasonString: "a very long reason",
    userProperty: [["key", "value"]],
  };
  encoder.setProperties(props, PacketType.puback, 10); // very small max size
  assert.equal(encoder.encodedSize(), 1); // only propertyLength 0 remains
});

test("decodeProperty throws on invalid property kind", () => {
  const encoder = new Encoder(PacketType.publish);
  // Manually encode an invalid property kind
  encoder.setVariableByteInteger(0x02); // propertyLength
  encoder.setVariableByteInteger(0xF0); // Invalid property ID
  encoder.setByte(1);

  const buf = encoder.done(0);
  const decoder = new Decoder(PacketType.publish, buf, 2);

  assert.throws(
    () => decoder.getProperties(PacketType.publish),
    /Property type 240 not allowed/,
  );
});

test("userProperty must be an array", () => {
  const encoder = new Encoder(PacketType.puback);
  const props = {
    userProperty: "I am not an array",
  };
  assert.throws(
    () => encoder.setProperties(props, PacketType.puback, 10),
    / userProperty must be an array/,
  );
});

test("userProperty item must be an array", () => {
  const encoder = new Encoder(PacketType.puback);
  const props = {
    userProperty: ["a", "b"],
  };
  assert.throws(
    () => encoder.setProperties(props, PacketType.puback, 10),
    / userProperty item must be an array/,
  );
});

test("encode/decode subscriptionIdentifiers", () => {
  const props = { subscriptionIdentifiers: [3, 5, 7] };
  const bytes = new Uint8Array([48, 7, 6, 0xb, 3, 0xb, 5, 0xb, 7]);
  const encoder = new Encoder(PacketType.publish);
  encoder.setProperties(props, PacketType.publish, 1000);
  const buf = encoder.done(0);
  assert.deepStrictEqual(buf, bytes);
  const decoder = new Decoder(PacketType.publish, buf, 2);
  const decoded = decoder.getProperties(PacketType.publish);
  assert.deepStrictEqual(decoded, props);
});
