import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnyPacket, PublishPacket } from "../deps.ts";
import { MQTTLevel, PacketType } from "../deps.ts";
import {
  connect,
  disconnect,
  ping,
  publish,
  startMockServer,
  startMockServer2,
  subscribe,
} from "../../dev_utils/mod.ts";

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

test("SUBSCRIBE with missing isAuthorizedToSubscribe handler authorizes subscribe", async () => {
  const { mqttConn, mqttServer } = startMockServer();
  mqttServer.handlers.isAuthorizedToSubscribe = undefined;

  await connect(mqttConn);

  const subscribePacket: AnyPacket = {
    type: PacketType.subscribe,
    protocolLevel: MQTTLevel.v4,
    id: 3,
    subscriptions: [
      { topicFilter: "sensors/temperature", qos: 0 },
    ],
  };
  mqttConn.send(subscribePacket);

  const { value: suback } = await mqttConn.next();
  assert.deepStrictEqual(suback.type, PacketType.suback, "Expected SUBACK");
  if (suback.type === PacketType.suback) {
    assert.deepStrictEqual(suback.id, 3);
    assert.deepStrictEqual(
      suback.returnCodes,
      [0],
    );
  }

  await disconnect(mqttConn);
});

test("SUBSCRIBE to unauthorized topic is rejected", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  const subscribePacket: AnyPacket = {
    type: PacketType.subscribe,
    protocolLevel: MQTTLevel.v4,
    id: 3,
    subscriptions: [
      { topicFilter: "topic/unauthorized", qos: 0 },
    ],
  };
  mqttConn.send(subscribePacket);

  const { value: suback } = await mqttConn.next();
  assert.deepStrictEqual(suback.type, PacketType.suback, "Expected SUBACK");
  if (suback.type === PacketType.suback) {
    assert.deepStrictEqual(suback.id, 3);
    assert.deepStrictEqual(
      suback.returnCodes,
      [128],
    );
  }

  await disconnect(mqttConn);
});
// ============================================================================
// Retained Message Tests
// ============================================================================

test("SUBSCRIBE receives retained message after SUBACK", async () => {
  const { mqttConn1, mqttConn2 } = startMockServer2();

  // First, publish a retained message (before any subscriber)
  await connect(mqttConn1);

  const retainedPayload = txtEncoder.encode("retained-value");
  await mqttConn1.send({
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    topic: "sensors/temperature",
    payload: retainedPayload,
    retain: true,
    qos: 0,
  });
  await disconnect(mqttConn1);

  // Connect
  await connect(mqttConn2);

  // Subscribe to the topic with retained message
  const subscribePacket: AnyPacket = {
    type: PacketType.subscribe,
    protocolLevel: MQTTLevel.v4,
    id: 10,
    subscriptions: [{ topicFilter: "sensors/temperature", qos: 0 }],
  };
  mqttConn2.send(subscribePacket);

  // Should receive SUBACK first
  const { value: suback } = await mqttConn2.next();
  assert.deepStrictEqual(suback.type, PacketType.suback, "Expected SUBACK");

  // Then should receive the retained message
  const { value: publish } = await mqttConn2.next();
  assert.deepStrictEqual(
    publish.type,
    PacketType.publish,
    "Expected retained PUBLISH",
  );
  if (publish.type === PacketType.publish) {
    assert.deepStrictEqual(publish.topic, "sensors/temperature");
    assert.deepStrictEqual(publish.payload, retainedPayload);
  }
  await disconnect(mqttConn2);
});

test("SUBSCRIBE receives multiple retained messages matching wildcard", async () => {
  const { mqttConn1, mqttConn2 } = startMockServer2();
  // Set up multiple retained messages
  await connect(mqttConn1);
  await mqttConn1.send({
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    topic: "sensors/temp/living",
    payload: txtEncoder.encode("22"),
    retain: true,
    qos: 0,
  });
  await mqttConn1.send({
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    topic: "sensors/temp/bedroom",
    payload: txtEncoder.encode("20"),
    retain: true,
    qos: 0,
  });
  await disconnect(mqttConn1);

  // Connect the second client
  await connect(mqttConn2);

  // Subscribe with wildcard
  mqttConn2.send({
    type: PacketType.subscribe,
    protocolLevel: MQTTLevel.v4,
    id: 11,
    subscriptions: [{ topicFilter: "sensors/temp/#", qos: 0 }],
  });

  // SUBACK
  const { value: suback } = await mqttConn2.next();
  assert.deepStrictEqual(suback.type, PacketType.suback);

  // Should receive both retained messages
  const messages: AnyPacket[] = [];
  const { value: msg1 } = await mqttConn2.next();
  messages.push(msg1);
  const { value: msg2 } = await mqttConn2.next();
  messages.push(msg2);

  const topics = messages
    .filter((m): m is PublishPacket => m.type === PacketType.publish)
    .map((m) => m.topic)
    .sort();

  assert.deepStrictEqual(topics, [
    "sensors/temp/bedroom",
    "sensors/temp/living",
  ]);

  await disconnect(mqttConn2);
});

test("SUBSCRIBE receives multiple retained messages with different QoS", async () => {
  const { mqttConn1, mqttConn2 } = startMockServer2();
  // Set up multiple retained messages
  await connect(mqttConn1);
  await publish(mqttConn1, "retained/qos0", 0, {
    retain: true,
    id: undefined,
  });
  await publish(mqttConn1, "retained/qos1", 1, {
    retain: true,
    id: 10,
  });
  await publish(mqttConn1, "retained/qos2", 2, {
    retain: true,
    id: 11,
  });
  await disconnect(mqttConn1);

  // Connect the second client
  await connect(mqttConn2);

  // Subscribe
  await subscribe(mqttConn2, [
    { topicFilter: "retained/qos0", qos: 0 },
    { topicFilter: "retained/qos1", qos: 1 },
    { topicFilter: "retained/qos2", qos: 2 },
  ]);

  // Should receive three retained messages
  const messages: AnyPacket[] = [];
  const { value: msg1 } = await mqttConn2.next();
  messages.push(msg1);
  const { value: msg2 } = await mqttConn2.next();
  messages.push(msg2);
  const { value: msg3 } = await mqttConn2.next();
  messages.push(msg3);

  const topics = messages
    .filter((m): m is PublishPacket => m.type === PacketType.publish)
    .map((m) => m.topic)
    .sort();

  assert.deepStrictEqual(topics, [
    "retained/qos0",
    "retained/qos1",
    "retained/qos2",
  ]);

  await disconnect(mqttConn2);
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
  await ping(mqttConn);
  await disconnect(mqttConn);
});
