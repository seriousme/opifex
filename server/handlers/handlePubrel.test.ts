import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnyPacket } from "../deps.ts";
import { MQTTLevel, PacketType } from "../deps.ts";
import { connect, disconnect, startMockServer } from "../../dev_utils/mod.ts";

const txtEncoder = new TextEncoder();

test("PUBREL returns PUBCOMP", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  // First send a QoS 2 PUBLISH to set up pending incoming
  const publishPacket: AnyPacket = {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    topic: "test/topic",
    payload: txtEncoder.encode("qos2"),
    qos: 2,
    retain: false,
    dup: false,
    id: 1,
  };
  mqttConn.send(publishPacket);

  // Should receive PUBREC
  const { value: pubrec } = await mqttConn.next();
  assert.deepStrictEqual(pubrec.type, PacketType.pubrec);

  // Now send PUBREL
  const pubrelPacket: AnyPacket = {
    type: PacketType.pubrel,
    protocolLevel: MQTTLevel.v4,
    id: 1,
  };
  mqttConn.send(pubrelPacket);

  // Should receive PUBCOMP
  const { value: pubcomp } = await mqttConn.next();
  assert.deepStrictEqual(pubcomp.type, PacketType.pubcomp, "Expected PUBCOMP");
  if (pubcomp.type === PacketType.pubcomp) {
    assert.deepStrictEqual(pubcomp.id, 1, "PUBCOMP ID should match PUBREL ID");
  }

  await disconnect(mqttConn);
});

test("PUBREL always returns PUBCOMP even without prior PUBREC", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  // Send PUBREL without prior QoS 2 PUBLISH
  const pubrelPacket: AnyPacket = {
    type: PacketType.pubrel,
    protocolLevel: MQTTLevel.v4,
    id: 99,
  };
  mqttConn.send(pubrelPacket);

  // Should still receive PUBCOMP (MQTT spec requires this)
  const { value: pubcomp } = await mqttConn.next();
  assert.deepStrictEqual(
    pubcomp.type,
    PacketType.pubcomp,
    "PUBREL should always receive PUBCOMP response",
  );
  if (pubcomp.type === PacketType.pubcomp) {
    assert.deepStrictEqual(pubcomp.id, 99);
  }

  await disconnect(mqttConn);
});
