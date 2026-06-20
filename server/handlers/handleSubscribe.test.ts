import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnyPacket, PublishPacket } from "../deps.ts";
import { MQTTLevel, PacketType } from "../deps.ts";
import { connect, disconnect, startMockServer } from "../../dev_utils/mod.ts";

const txtEncoder = new TextEncoder();

test("SUBSCRIBE returns SUBACK with matching return codes", async () => {
  const { mqttConn } = startMockServer();

  // Connect first
  await connect(mqttConn);

  // Subscribe to a topic
  const subscribePacket: AnyPacket = {
    type: PacketType.subscribe,
    protocolLevel: MQTTLevel.v4,
    id: 1,
    subscriptions: [
      { topicFilter: "test/topic", qos: 0 },
    ],
  };
  mqttConn.send(subscribePacket);

  const { value: suback } = await mqttConn.next();
  assert.deepStrictEqual(suback.type, PacketType.suback, "Expected SUBACK");
  if (suback.type === PacketType.suback) {
    assert.deepStrictEqual(suback.id, 1, "SUBACK ID should match SUBSCRIBE ID");
    assert.deepStrictEqual(
      suback.returnCodes,
      [0],
      "Return code should match requested QoS",
    );
  }

  await disconnect(mqttConn);
});

test("SUBSCRIBE with multiple topics returns multiple return codes", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  const subscribePacket: AnyPacket = {
    type: PacketType.subscribe,
    protocolLevel: MQTTLevel.v4,
    id: 2,
    subscriptions: [
      { topicFilter: "topic/one", qos: 0 },
      { topicFilter: "topic/two", qos: 1 },
      { topicFilter: "topic/three", qos: 2 },
    ],
  };
  mqttConn.send(subscribePacket);

  const { value: suback } = await mqttConn.next();
  assert.deepStrictEqual(suback.type, PacketType.suback, "Expected SUBACK");
  if (suback.type === PacketType.suback) {
    assert.deepStrictEqual(suback.id, 2);
    assert.deepStrictEqual(
      suback.returnCodes,
      [0, 1, 2],
      "Return codes should match requested QoS levels in order",
    );
  }

  await disconnect(mqttConn);
});

test("SUBSCRIBE with wildcard topics works", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  const subscribePacket: AnyPacket = {
    type: PacketType.subscribe,
    protocolLevel: MQTTLevel.v4,
    id: 3,
    subscriptions: [
      { topicFilter: "sensors/+/temperature", qos: 0 },
      { topicFilter: "events/#", qos: 1 },
    ],
  };
  mqttConn.send(subscribePacket);

  const { value: suback } = await mqttConn.next();
  assert.deepStrictEqual(suback.type, PacketType.suback, "Expected SUBACK");
  if (suback.type === PacketType.suback) {
    assert.deepStrictEqual(suback.id, 3);
    assert.deepStrictEqual(
      suback.returnCodes,
      [0, 1],
    );
  }

  await disconnect(mqttConn);
});

// ============================================================================
// Retained Message Tests
// ============================================================================

test("SUBSCRIBE receives retained message after SUBACK", async () => {
  const { mqttConn, mqttServer } = startMockServer();

  // First, publish a retained message (before any subscriber)

  const retainedPayload = txtEncoder.encode("retained-value");
  mqttServer.persistence.retained.set("sensors/temperature", {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    topic: "sensors/temperature",
    payload: retainedPayload,
    retain: true,
    qos: 0,
  });

  // Connect
  await connect(mqttConn);

  // Subscribe to the topic with retained message
  const subscribePacket: AnyPacket = {
    type: PacketType.subscribe,
    protocolLevel: MQTTLevel.v4,
    id: 10,
    subscriptions: [{ topicFilter: "sensors/temperature", qos: 0 }],
  };
  mqttConn.send(subscribePacket);

  // Should receive SUBACK first
  const { value: suback } = await mqttConn.next();
  assert.deepStrictEqual(suback.type, PacketType.suback, "Expected SUBACK");

  // Then should receive the retained message
  const { value: publish } = await mqttConn.next();
  assert.deepStrictEqual(
    publish.type,
    PacketType.publish,
    "Expected retained PUBLISH",
  );
  if (publish.type === PacketType.publish) {
    assert.deepStrictEqual(publish.topic, "sensors/temperature");
    assert.deepStrictEqual(publish.payload, retainedPayload);
  }
  await disconnect(mqttConn);
});

test("SUBSCRIBE receives multiple retained messages matching wildcard", async () => {
  const { mqttConn, mqttServer } = startMockServer();
  // Set up multiple retained messages
  mqttServer.persistence.retained.set("sensors/temp/living", {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    topic: "sensors/temp/living",
    payload: txtEncoder.encode("22"),
    retain: true,
    qos: 0,
  });
  mqttServer.persistence.retained.set("sensors/temp/bedroom", {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    topic: "sensors/temp/bedroom",
    payload: txtEncoder.encode("20"),
    retain: true,
    qos: 0,
  });

  // Connect
  await connect(mqttConn);

  // Subscribe with wildcard
  mqttConn.send({
    type: PacketType.subscribe,
    protocolLevel: MQTTLevel.v4,
    id: 11,
    subscriptions: [{ topicFilter: "sensors/temp/#", qos: 0 }],
  });

  // SUBACK
  const { value: suback } = await mqttConn.next();
  assert.deepStrictEqual(suback.type, PacketType.suback);

  // Should receive both retained messages
  const messages: AnyPacket[] = [];
  const { value: msg1 } = await mqttConn.next();
  messages.push(msg1);
  const { value: msg2 } = await mqttConn.next();
  messages.push(msg2);

  const topics = messages
    .filter((m): m is PublishPacket => m.type === PacketType.publish)
    .map((m) => m.topic)
    .sort();

  assert.deepStrictEqual(topics, [
    "sensors/temp/bedroom",
    "sensors/temp/living",
  ]);

  await disconnect(mqttConn);
});

test("Publishing empty payload clears retained message", async () => {
  const { mqttConn, mqttServer } = startMockServer();

  // Set up a retained message
  mqttServer.persistence.retained.set("test/retained", {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    topic: "test/retained",
    payload: txtEncoder.encode("value"),
    retain: true,
    qos: 0,
  });

  // Verify it's there
  assert.strictEqual(
    mqttServer.persistence.retained.has("test/retained"),
    true,
  );

  // Connect and publish empty payload with retain=true to clear it
  await connect(mqttConn);

  // Publish empty payload with retain flag to clear
  mqttServer.persistence.publish("test/retained", {
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    topic: "test/retained",
    payload: new Uint8Array(0),
    retain: true,
    qos: 0,
  });

  // Verify it's been cleared
  assert.strictEqual(
    mqttServer.persistence.retained.has("test/retained"),
    false,
  );

  await disconnect(mqttConn);
});

test("SUBSCRIBE to topic without retained message receives only SUBACK", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  // Subscribe to topic with no retained message
  mqttConn.send({
    type: PacketType.subscribe,
    protocolLevel: MQTTLevel.v4,
    id: 12,
    subscriptions: [{ topicFilter: "no/retained/here", qos: 0 }],
  });

  const { value: suback } = await mqttConn.next();
  assert.deepStrictEqual(suback.type, PacketType.suback);

  // No more messages should be pending - send a ping to verify
  mqttConn.send({ type: PacketType.pingreq, protocolLevel: MQTTLevel.v4 });
  const { value: pingres } = await mqttConn.next();
  assert.deepStrictEqual(
    pingres.type,
    PacketType.pingres,
    "Next packet should be PINGRES, not a retained message",
  );

  await disconnect(mqttConn);
});
