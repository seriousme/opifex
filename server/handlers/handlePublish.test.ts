import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnyPacket } from "../deps.ts";
import { MQTTLevel, PacketType } from "../deps.ts";
import {
  connect,
  disconnect,
  isAuthenticatedBroker,
  ping,
  startMockServer,
} from "../../dev_utils/mod.ts";

const txtEncoder = new TextEncoder();

test("PUBLISH QoS 0 does not receive acknowledgment", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  // Publish QoS 0
  const publishPacket: AnyPacket = {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    topic: "test/topic",
    payload: txtEncoder.encode("hello"),
    qos: 0,
    retain: false,
    dup: false,
  };
  mqttConn.send(publishPacket);

  // Send PINGREQ to verify no PUBACK was queued before it
  // QoS 0 should not produce PUBACK, next response should be PINGRES
  await ping(mqttConn);

  await disconnect(mqttConn);
});

test("PUBLISH QoS 1 receives PUBACK", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  // Publish QoS 1
  const publishPacket: AnyPacket = {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    topic: "test/topic",
    payload: txtEncoder.encode("hello"),
    qos: 1,
    retain: false,
    dup: false,
    id: 1,
  };
  mqttConn.send(publishPacket);

  const { value: puback } = await mqttConn.next();
  assert.deepStrictEqual(puback.type, PacketType.puback, "Expected PUBACK");
  if (puback.type === PacketType.puback) {
    assert.deepStrictEqual(puback.id, 1, "PUBACK ID should match PUBLISH ID");
  }

  await disconnect(mqttConn);
});

test("PUBLISH QoS 2 receives PUBREC", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  // Publish QoS 2
  const publishPacket: AnyPacket = {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    topic: "test/topic",
    payload: txtEncoder.encode("hello"),
    qos: 2,
    retain: false,
    dup: false,
    id: 2,
  };
  mqttConn.send(publishPacket);

  const { value: pubrec } = await mqttConn.next();
  assert.deepStrictEqual(pubrec.type, PacketType.pubrec, "Expected PUBREC");
  if (pubrec.type === PacketType.pubrec) {
    assert.deepStrictEqual(pubrec.id, 2, "PUBREC ID should match PUBLISH ID");
  }

  await disconnect(mqttConn);
});

test("Publish with missing isAuthorizedToPublish handler authorizes publish", async () => {
  const { mqttConn, mqttServer } = startMockServer();
  mqttServer.handlers.isAuthorizedToPublish = undefined;

  await connect(mqttConn);
  // Try to publish to unauthorized topic
  const publishPacket: AnyPacket = {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    topic: "topic/unauthorized",
    payload: txtEncoder.encode("test"),
    qos: 1,
    retain: false,
    dup: false,
    id: 3,
  };
  mqttConn.send(publishPacket);
  const { value: puback } = await mqttConn.next();
  assert.deepStrictEqual(puback.type, PacketType.puback, "Expected PUBACK");
  if (puback.type === PacketType.puback) {
    assert.deepStrictEqual(puback.id, 3, "PUBACK ID should match PUBLISH ID");
  }
  await disconnect(mqttConn);
});

test("PUBLISH to unauthorized topic is rejected", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  // Try to publish to unauthorized topic
  const publishPacket: AnyPacket = {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    topic: "topic/unauthorized",
    payload: txtEncoder.encode("test"),
    qos: 1,
    retain: false,
    dup: false,
    id: 3,
  };
  mqttConn.send(publishPacket);

  await mqttConn.next();
  assert.equal(mqttConn.isClosed, true, "expect connection to be closed");
});

test("PUBLISH to $SYS topic is rejected", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  // Try to publish to $SYS topic
  const publishPacket: AnyPacket = {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    topic: "$SYS/broker/clients",
    payload: txtEncoder.encode("test"),
    qos: 1,
    retain: false,
    dup: false,
    id: 3,
  };
  mqttConn.send(publishPacket);
  await mqttConn.next();
  assert.equal(mqttConn.isClosed, true, "expect connection to be closed");
});

test("PUBLISH to $SYS topic is allowed for brokers", async () => {
  const { mqttConn, mqttServer } = startMockServer();
  // this will set the context.isBroker=true on authentication
  mqttServer.handlers.isAuthenticated = isAuthenticatedBroker;

  await connect(mqttConn, { clientId: "broker1" });
  // Try to publish to $SYS topic
  const publishPacket: AnyPacket = {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    topic: "$SYS/broker/clients",
    payload: txtEncoder.encode("test"),
    qos: 0,
    retain: false,
    dup: false,
    id: 3,
  };
  mqttConn.send(publishPacket);
  // connection should still be alive
  await ping(mqttConn);
  await disconnect(mqttConn);
});
