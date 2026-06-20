import assert from "node:assert/strict";
import { test } from "node:test";
import { connect, disconnect, startMockServer } from "../../dev_utils/mod.ts";
import type { AnyPacket } from "../deps.ts";
import { MQTTLevel, PacketType } from "../deps.ts";

const txtEncoder = new TextEncoder();

test("MQTT-4.3.1: QoS 1 duplicate PUBLISH is acknowledged", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  // Send QoS 1 PUBLISH with dup=false
  const publishPacket: AnyPacket = {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    topic: "test/topic",
    payload: txtEncoder.encode("message"),
    qos: 1,
    retain: false,
    dup: false,
    id: 1,
  };
  mqttConn.send(publishPacket);

  // Receive first PUBACK
  const { value: puback1 } = await mqttConn.next();
  assert.deepStrictEqual(puback1.type, PacketType.puback);
  if (puback1.type === PacketType.puback) {
    assert.deepStrictEqual(puback1.id, 1);
  }

  // Send duplicate PUBLISH with dup=true and same packet ID
  const duplicatePublishPacket: AnyPacket = {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    topic: "test/topic",
    payload: txtEncoder.encode("message"),
    qos: 1,
    retain: false,
    dup: true,
    id: 1,
  };
  mqttConn.send(duplicatePublishPacket);

  // Should receive PUBACK for duplicate as well
  const { value: puback2 } = await mqttConn.next();
  assert.deepStrictEqual(
    puback2.type,
    PacketType.puback,
    "Duplicate PUBLISH should receive PUBACK",
  );
  if (puback2.type === PacketType.puback) {
    assert.deepStrictEqual(puback2.id, 1, "PUBACK ID should match");
  }

  await disconnect(mqttConn);
});

test("MQTT-4.3.2: QoS 2 duplicate PUBLISH returns PUBREC without redelivery", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  // Send QoS 2 PUBLISH with dup=false
  const publishPacket: AnyPacket = {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    topic: "test/topic",
    payload: txtEncoder.encode("qos2message"),
    qos: 2,
    retain: false,
    dup: false,
    id: 2,
  };
  mqttConn.send(publishPacket);

  // Receive first PUBREC
  const { value: pubrec1 } = await mqttConn.next();
  assert.deepStrictEqual(pubrec1.type, PacketType.pubrec);
  if (pubrec1.type === PacketType.pubrec) {
    assert.deepStrictEqual(pubrec1.id, 2);
  }

  // Send duplicate PUBLISH with dup=true and same packet ID
  // Per MQTT spec: "the Receiver MUST acknowledge any subsequent
  // PUBLISH packet with the same Packet Identifier by sending a PUBREC.
  // It MUST NOT cause duplicate messages to be delivered to any onward recipients"
  const duplicatePublishPacket: AnyPacket = {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    topic: "test/topic",
    payload: txtEncoder.encode("qos2message"),
    qos: 2,
    retain: false,
    dup: true,
    id: 2,
  };
  mqttConn.send(duplicatePublishPacket);

  // Should receive PUBREC for duplicate without redelivery
  const { value: pubrec2 } = await mqttConn.next();
  assert.deepStrictEqual(
    pubrec2.type,
    PacketType.pubrec,
    "Duplicate QoS 2 PUBLISH should return PUBREC",
  );
  if (pubrec2.type === PacketType.pubrec) {
    assert.deepStrictEqual(pubrec2.id, 2);
  }

  // Complete the QoS 2 exchange with PUBREL
  const pubrelPacket: AnyPacket = {
    type: PacketType.pubrel,
    protocolLevel: MQTTLevel.v4,
    id: 2,
  };
  mqttConn.send(pubrelPacket);

  // Should receive PUBCOMP
  const { value: pubcomp } = await mqttConn.next();
  assert.deepStrictEqual(pubcomp.type, PacketType.pubcomp);

  await disconnect(mqttConn);
});

test("ignores duplicate PUBACK gracefully", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  // Send QoS 1 PUBLISH (incoming)
  const publishPacket: AnyPacket = {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    topic: "test/topic",
    payload: txtEncoder.encode("message"),
    qos: 1,
    retain: false,
    dup: false,
    id: 3,
  };
  mqttConn.send(publishPacket);

  // Receive PUBACK
  const { value: puback } = await mqttConn.next();
  assert.deepStrictEqual(puback.type, PacketType.puback);

  // Send duplicate PUBACK (shouldn't cause any issue or response)
  const duplicatePubackPacket: AnyPacket = {
    type: PacketType.puback,
    protocolLevel: MQTTLevel.v4,
    id: 3,
  };
  mqttConn.send(duplicatePubackPacket);

  // Send PINGREQ to verify server is still responsive
  const pingreqPacket: AnyPacket = {
    type: PacketType.pingreq,
    protocolLevel: MQTTLevel.v4,
  };
  mqttConn.send(pingreqPacket);

  // Should receive PINGRES (duplicate PUBACK should be silently ignored)
  const { value: pingres } = await mqttConn.next();
  assert.deepStrictEqual(
    pingres.type,
    PacketType.pingres,
    "Duplicate PUBACK should be gracefully ignored",
  );

  await disconnect(mqttConn);
});

test("PUBREL without prior PUBREC still returns PUBCOMP", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  // Send PUBREL directly without prior QoS 2 PUBLISH/PUBREC sequence
  // This can happen if PUBREC was lost and client retransmits PUBREL
  const pubrelPacket: AnyPacket = {
    type: PacketType.pubrel,
    protocolLevel: MQTTLevel.v4,
    id: 99,
  };
  mqttConn.send(pubrelPacket);

  // Should still receive PUBCOMP per MQTT spec [MQTT-4.3.3-1]
  const { value: pubcomp } = await mqttConn.next();
  assert.deepStrictEqual(
    pubcomp.type,
    PacketType.pubcomp,
    "PUBREL without prior PUBREC should still return PUBCOMP",
  );
  if (pubcomp.type === PacketType.pubcomp) {
    assert.deepStrictEqual(pubcomp.id, 99);
  }

  await disconnect(mqttConn);
});
