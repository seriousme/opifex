import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnyPacket } from "../deps.ts";
import { MQTTLevel, PacketType } from "../deps.ts";
import { connect, disconnect, startMockServer } from "../../dev_utils/mod.ts";

test("UNSUBSCRIBE returns UNSUBACK", async () => {
  const { mqttConn } = startMockServer();

  // Connect first
  await connect(mqttConn);

  // Subscribe first
  const subscribePacket: AnyPacket = {
    type: PacketType.subscribe,
    protocolLevel: MQTTLevel.v4,
    id: 1,
    subscriptions: [{ topicFilter: "test/topic", qos: 0 }],
  };
  mqttConn.send(subscribePacket);
  await mqttConn.next(); // consume SUBACK

  // Unsubscribe
  const unsubscribePacket: AnyPacket = {
    type: PacketType.unsubscribe,
    protocolLevel: MQTTLevel.v4,
    id: 2,
    topicFilters: ["test/topic"],
  };
  mqttConn.send(unsubscribePacket);

  const { value: unsuback } = await mqttConn.next();
  assert.deepStrictEqual(
    unsuback.type,
    PacketType.unsuback,
    "Expected UNSUBACK",
  );
  if (unsuback.type === PacketType.unsuback) {
    assert.deepStrictEqual(
      unsuback.id,
      2,
      "UNSUBACK ID should match UNSUBSCRIBE ID",
    );
  }

  await disconnect(mqttConn);
});

test("UNSUBSCRIBE from multiple topics returns UNSUBACK", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  // Subscribe to multiple topics
  const subscribePacket: AnyPacket = {
    type: PacketType.subscribe,
    protocolLevel: MQTTLevel.v4,
    id: 1,
    subscriptions: [
      { topicFilter: "topic/one", qos: 0 },
      { topicFilter: "topic/two", qos: 0 },
    ],
  };
  mqttConn.send(subscribePacket);
  await mqttConn.next(); // consume SUBACK

  // Unsubscribe from both
  const unsubscribePacket: AnyPacket = {
    type: PacketType.unsubscribe,
    protocolLevel: MQTTLevel.v4,
    id: 3,
    topicFilters: ["topic/one", "topic/two"],
  };
  mqttConn.send(unsubscribePacket);

  const { value: unsuback } = await mqttConn.next();
  assert.deepStrictEqual(unsuback.type, PacketType.unsuback);
  if (unsuback.type === PacketType.unsuback) {
    assert.deepStrictEqual(unsuback.id, 3);
  }

  await disconnect(mqttConn);
});

test("UNSUBSCRIBE from non-existent subscription still returns UNSUBACK", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  // Unsubscribe without subscribing first
  const unsubscribePacket: AnyPacket = {
    type: PacketType.unsubscribe,
    protocolLevel: MQTTLevel.v4,
    id: 5,
    topicFilters: ["nonexistent/topic"],
  };
  mqttConn.send(unsubscribePacket);

  const { value: unsuback } = await mqttConn.next();
  assert.deepStrictEqual(
    unsuback.type,
    PacketType.unsuback,
    "Should still return UNSUBACK even for non-existent subscription",
  );
  if (unsuback.type === PacketType.unsuback) {
    assert.deepStrictEqual(unsuback.id, 5);
  }

  await disconnect(mqttConn);
});
