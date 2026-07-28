import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnyPacket, PublishPacket } from "../deps.ts";
import { MQTTLevel, PacketType, ReasonCode } from "../deps.ts";
import {
  addMockClient,
  connect,
  connect5,
  disconnect,
  disconnect5,
  isAuthenticatedBroker,
  ping,
  publish,
  startMockServer,
  subscribe,
  subscribe5,
} from "../../dev_utils/mod.ts";
import { SqlitePersistence } from "../../persistence/sqlite/sqlitePersistence.ts";
import { receiveMessages } from "../../dev_utils/packetHelpers.ts";

const txtEncoder = new TextEncoder();

test("SUBSCRIBE returns SUBACK with matching return codes", async () => {
  const { mqttConn } = startMockServer();

  // Connect first
  await connect(mqttConn);

  // Subscribe to a topic
  // subscribe() also checks packetId and QoS in subacks
  await subscribe(mqttConn, [{ topicFilter: "test/topic", qos: 0 }], { id: 1 });
  await disconnect(mqttConn);
});

test("SUBSCRIBE with multiple topics returns multiple return codes", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);
  // subscribe() also checks packetId and QoS in subacks
  await subscribe(mqttConn, [
    { topicFilter: "topic/one", qos: 0 },
    { topicFilter: "topic/two", qos: 1 },
    { topicFilter: "topic/three", qos: 2 },
  ], { id: 2 });

  await disconnect(mqttConn);
});

test("SUBSCRIBE with wildcard topics works", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  await subscribe(mqttConn, [
    { topicFilter: "sensors/+/temperature", qos: 0 },
    { topicFilter: "events/#", qos: 1 },
  ], { id: 3 });

  await disconnect(mqttConn);
});

test("SUBSCRIBE with missing isAuthorizedToSubscribe handler authorizes subscribe", async () => {
  const { mqttConn, mqttServer } = startMockServer();
  mqttServer.handlers.isAuthorizedToSubscribe = undefined;

  await connect(mqttConn);

  await subscribe(mqttConn, [
    { topicFilter: "sensors/temperature", qos: 0 },
  ], { id: 3 });

  await disconnect(mqttConn);
});

test("SUBSCRIBE to unauthorized topic is rejected", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  const subAck = await subscribe(mqttConn, [
    { topicFilter: "topic/unauthorized", qos: 0 },
  ], { id: 3, checkAcks: false });

  assert.deepStrictEqual(subAck.type, PacketType.suback, "Expected SUBACK");
  assert.deepStrictEqual(subAck.id, 3);
  assert.deepStrictEqual(
    subAck.returnCodes,
    [128],
  );

  await disconnect(mqttConn);
});
// ============================================================================
// Retained Message Tests
// ============================================================================

test("SUBSCRIBE receives retained message after SUBACK", async () => {
  const { mqttConn: mqttConn1, mqttServer } = startMockServer();
  const retainedPayload = "retained-value";
  // First, publish a retained message (before any subscriber)
  await connect(mqttConn1);

  await publish(mqttConn1, "sensors/temperature", 0, {
    payload: retainedPayload,
    retain: true,
  });
  await disconnect(mqttConn1);

  // Connect
  const mqttConn2 = addMockClient(mqttServer);
  await connect(mqttConn2);

  // Subscribe to the topic with retained message
  await subscribe(mqttConn2, [{ topicFilter: "sensors/temperature", qos: 0 }], {
    id: 10,
  });

  // Then should receive the retained message
  const { value: publishPkt } = await mqttConn2.next();
  assert.deepStrictEqual(
    publishPkt.type,
    PacketType.publish,
    "Expected retained PUBLISH",
  );

  assert.deepStrictEqual(publishPkt.topic, "sensors/temperature");
  assert.deepStrictEqual(
    publishPkt.payload,
    txtEncoder.encode(retainedPayload),
  );

  await disconnect(mqttConn2);
});

test("SUBSCRIBE receives multiple retained messages matching wildcard", async () => {
  const { mqttConn: mqttConn1, mqttServer } = startMockServer();
  // Set up multiple retained messages
  await connect(mqttConn1);
  await publish(mqttConn1, "sensors/temp/living", 0, {
    payload: "22",
    retain: true,
  });

  await publish(mqttConn1, "sensors/temp/bedroom", 0, {
    payload: "20",
    retain: true,
  });

  await disconnect(mqttConn1);

  // Connect the second client
  const mqttConn2 = addMockClient(mqttServer);
  await connect(mqttConn2);

  // Subscribe with wildcard
  await subscribe(mqttConn2, [{ topicFilter: "sensors/temp/#", qos: 0 }], {
    id: 11,
  });

  // Should receive both retained messages
  const messages = await receiveMessages(mqttConn2);

  const topics = messages
    .filter((m): m is PublishPacket => m.type === PacketType.publish)
    .map((m) => m.topic)
    .sort();

  assert.deepStrictEqual(topics, [
    "sensors/temp/bedroom",
    "sensors/temp/living",
  ]);
});

test("SUBSCRIBE receives multiple retained messages with different QoS", async () => {
  const { mqttConn: mqttConn1, mqttServer } = startMockServer();
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

  // Subscribe
  await subscribe(mqttConn1, [
    { topicFilter: "+/+", qos: 2 },
  ]);

  // Should receive three retained messages
  const messages = await receiveMessages(mqttConn1);

  const topics = messages
    .filter((m): m is PublishPacket => m.type === PacketType.publish)
    .map((m) => m.topic)
    .sort();

  assert.deepStrictEqual(topics, [
    "retained/qos0",
    "retained/qos1",
    "retained/qos2",
  ]);

  const mqttConn2 = addMockClient(mqttServer);
  await connect(mqttConn2);
  // clear retained
  await publish(mqttConn2, "retained/qos0", 0, {
    payload: "",
    retain: true,
    id: undefined,
  });
  await publish(mqttConn2, "retained/qos1", 1, {
    payload: "",
    retain: true,
    id: 10,
  });
  await publish(mqttConn2, "retained/qos2", 2, {
    payload: "",
    retain: true,
    id: 11,
  });
  // Subscribe
  await subscribe(mqttConn2, [
    { topicFilter: "+/+", qos: 2 },
  ]);
  // should receive no messages, check with ping
  await ping(mqttConn2);
  await disconnect(mqttConn2);
});

test("SUBSCRIBE to topic without retained message receives only SUBACK", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  // Subscribe to topic with no retained message
  await subscribe(mqttConn, [{ topicFilter: "no/retained/here", qos: 0 }]);

  // No more messages should be pending - send a ping to verify
  await ping(mqttConn);
  await disconnect(mqttConn);
});

test("SUBSCRIBE with wildcard does not match $ topics", async () => {
  const { mqttConn: subscriber, mqttServer } = startMockServer();
  mqttServer.handlers.isAuthenticated = isAuthenticatedBroker;

  const wildcardTopic = "+/+";
  const dollarTopic = "$TopicA/B";

  // subscribe to wildcard topic
  await connect(subscriber);
  await subscribe(subscriber, [{ topicFilter: wildcardTopic, qos: 1 }], {
    id: 30,
  });

  const publisher = addMockClient(mqttServer);
  await connect(publisher);

  await publish(publisher, dollarTopic, 1, {
    payload: "dollar topic message",
    retain: false,
    id: 105,
  });
  await disconnect(publisher);

  await ping(subscriber);

  await disconnect(subscriber);
});

test("SUBSCRIBE receives retained messages and clearing works", async () => {
  const { mqttConn: publisher1, mqttServer } = startMockServer();

  const qos0topic = "fromb/qos 0";
  const qos1topic = "fromb/qos 1";
  const qos2topic = "fromb/qos2";
  const wildcardTopic = "fromb/+";

  await connect(publisher1);

  await publish(publisher1, qos0topic, 0, {
    payload: "qos0",
    retain: true,
  });
  await publish(publisher1, qos1topic, 1, {
    payload: "qos1",
    retain: true,
    id: 101,
  });
  await publish(publisher1, qos2topic, 2, {
    payload: "qos2",
    retain: true,
    id: 102,
  });

  disconnect(publisher1);

  const subscriber1 = addMockClient(mqttServer);
  await connect(subscriber1);

  await subscribe(subscriber1, [{ topicFilter: wildcardTopic, qos: 2 }], {
    id: 20,
  });

  const messages = await receiveMessages(subscriber1);

  const receivedTopics = messages
    .filter((m): m is PublishPacket => m.type === PacketType.publish)
    .map((m) => m.topic)
    .sort();

  assert.deepStrictEqual(
    receivedTopics,
    [qos0topic, qos1topic, qos2topic].sort(),
    "Should receive all three retained messages",
  );

  const publisher2 = addMockClient(mqttServer);
  await connect(publisher2);

  await publish(publisher2, qos0topic, 0, {
    payload: "",
    retain: true,
  });
  await publish(publisher2, qos1topic, 1, {
    payload: "",
    retain: true,
    id: 103,
  });
  await publish(publisher2, qos2topic, 2, {
    payload: "",
    retain: true,
    id: 104,
  });

  await disconnect(publisher2);

  const subscriber2 = addMockClient(mqttServer);

  await connect(subscriber2);

  await subscribe(subscriber2, [{ topicFilter: wildcardTopic, qos: 2 }], {
    id: 21,
  });
  await ping(subscriber2);

  await disconnect(subscriber2);
});

test("SUBSCRIBE redelivery on reconnect (uncompleted QoS 1/2 exchanges)", async () => {
  const sqlitePersistence = new SqlitePersistence();
  const { mqttConn: subscriber, mqttServer } = startMockServer({
    persistence: sqlitePersistence,
  });
  const clientId = "myclient";
  const topic1 = "TopicA/B";
  const topic3 = "TopicA/C";
  const wildtopic6 = "TopicA/#";

  await connect(subscriber, { clean: false, clientId });
  await subscribe(subscriber, [{ topicFilter: wildtopic6, qos: 2 }], {
    id: 40,
  });
  await disconnect(subscriber);

  const publisher = addMockClient(mqttServer);
  await connect(publisher);

  await publish(publisher, topic1, 1, {
    payload: "qos 1 message",
    retain: false,
    id: 201,
  });
  await publish(publisher, topic3, 2, {
    payload: "qos 2 message",
    retain: false,
    id: 202,
  });

  await disconnect(publisher);

  const subscriberReconnect = addMockClient(mqttServer);

  await connect(subscriberReconnect, { clean: false, clientId });

  const messages = await receiveMessages(subscriberReconnect);

  const receivedTopics = messages
    .filter((m): m is PublishPacket => m.type === PacketType.publish)
    .map((m) => m.topic)
    .sort();

  assert.deepStrictEqual(
    receivedTopics,
    [topic1, topic3].sort(),
    "Should receive both uncompleted QoS 1 and QoS 2 messages upon reconnect",
  );

  await disconnect(subscriberReconnect);
});

// ============================================================================
// MQTT v5 Specific Tests
// ============================================================================

test("SUBSCRIBE v5 returns SUBACK with reasonCodes and handles subscriptionIdentifier", async () => {
  const { mqttConn } = startMockServer();

  await connect5(mqttConn);

  const subAck = await subscribe5(mqttConn, [{
    topicFilter: "v5/test/topic",
    qos: 1,
    noLocal: true,
    retainAsPublished: true,
    retainHandling: 0,
  }], { id: 100, subscriptionIdentifier: 42 });

  assert.deepStrictEqual(subAck.id, 100);
  assert.deepStrictEqual(
    subAck.reasonCodes,
    [ReasonCode.grantedQos1],
    "Expected reasonCodes matching requested QoS 1 for MQTT v5",
  );

  await disconnect5(mqttConn);
});

test("SUBSCRIBE v5 to unauthorized topic returns ReasonCode.notAuthorized (0x87)", async () => {
  const { mqttConn } = startMockServer();

  await connect5(mqttConn);

  const subAck = await subscribe5(mqttConn, [{
    topicFilter: "topic/unauthorized",
    qos: 0,
  }], {
    id: 101,
    checkAcks: false,
  });

  assert.deepStrictEqual(subAck.type, PacketType.suback, "Expected SUBACK");
  assert.deepStrictEqual(subAck.id, 101);
  assert.deepStrictEqual(
    subAck.reasonCodes,
    [ReasonCode.notAuthorized],
    "Return code should be 0x87 (ReasonCode.notAuthorized) for MQTT v5",
  );

  await disconnect5(mqttConn);
});

test("SUBSCRIBE v5 handles mixed authorized and unauthorized topics", async () => {
  const { mqttConn } = startMockServer();

  await connect5(mqttConn);

  const subAck = await subscribe5(mqttConn, [
    { topicFilter: "topic/authorized", qos: 1 },
    { topicFilter: "topic/unauthorized", qos: 2 },
  ], { id: 102, checkAcks: false });

  assert.deepStrictEqual(subAck.type, PacketType.suback, "Expected SUBACK");

  assert.deepStrictEqual(subAck.id, 102);
  assert.deepStrictEqual(
    subAck.reasonCodes,
    [ReasonCode.grantedQos1, ReasonCode.notAuthorized],
    "Should return success code for authorized topic and 0x87 for unauthorized topic in exact order",
  );

  await disconnect5(mqttConn);
});

// ============================================================================
// Edge Cases & Error Handling
// ============================================================================

test("SUBSCRIBE does not trigger retained messages when all subscriptions fail authorization", async () => {
  const { mqttConn: publisher, mqttServer } = startMockServer();

  // Set up a retained message first
  await connect(publisher);
  await publish(publisher, "topic/unauthorized", 0, {
    payload: "secret-retained",
    retain: true,
  });

  await disconnect(publisher);

  const subscriber = addMockClient(mqttServer);
  await connect(subscriber);

  const subAck = await subscribe(subscriber, [{
    topicFilter: "topic/unauthorized",
    qos: 0,
  }], {
    id: 104,
    checkAcks: false,
  });

  // Expect SUBACK with 128 (0x80)
  assert.deepStrictEqual(subAck.type, PacketType.suback);
  assert.deepStrictEqual(subAck.returnCodes, [128]);

  // Ping to verify no retained message was forwarded
  await ping(subscriber);
  await disconnect(subscriber);
});

test(
  "SUBSCRIBE handles error thrown inside isAuthorizedToSubscribe gracefully",
  { skip: true },
  async () => {
    const { mqttConn, mqttServer } = startMockServer();

    // Force authorization handler to throw an error
    mqttServer.handlers.isAuthorizedToSubscribe = () => {
      throw new Error("Authorization handler internal failure");
    };

    await connect(mqttConn);

    const subscribePacket: AnyPacket = {
      type: PacketType.subscribe,
      protocolLevel: MQTTLevel.v4,
      id: 105,
      subscriptions: [
        { topicFilter: "sensors/temperature", qos: 0 },
      ],
    };

    // The assertion verifies whether the exception bubble-up matches expected server context behavior
    await assert.rejects(
      async () => {
        mqttConn.send(subscribePacket);
        await mqttConn.next();
      },
      (err: Error) => {
        return err.message.includes("Authorization handler internal failure");
      },
    );
  },
);
