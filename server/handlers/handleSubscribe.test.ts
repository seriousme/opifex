import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnyPacket, PublishPacket } from "../deps.ts";
import { MQTTLevel, PacketType } from "../deps.ts";
import {
  addMockClient,
  connect,
  disconnect,
  isAuthenticatedBroker,
  ping,
  publish,
  startMockServer,
  subscribe,
} from "../../dev_utils/mod.ts";
import { SqlitePersistence } from "../../persistence/sqlite/sqlitePersistence.ts";

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
  const { mqttConn: mqttConn1, mqttServer } = startMockServer();

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
  const mqttConn2 = addMockClient(mqttServer);
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
  const { mqttConn: mqttConn1, mqttServer } = startMockServer();
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
  const mqttConn2 = addMockClient(mqttServer);
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
  const messages: AnyPacket[] = [];
  const { value: msg1 } = await mqttConn1.next();
  messages.push(msg1);
  const { value: msg2 } = await mqttConn1.next();
  messages.push(msg2);
  const { value: msg3 } = await mqttConn1.next();
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
  await disconnect(mqttConn1);
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

  // Definieer de topics op basis van de Python test setup
  const wildcardTopic = "+/+"; // Overeenkomend met topics[5] uit Python
  const dollarTopic = "$TopicA/B"; // Overeenkomend met "$"+topics[1] uit Python

  // subscribe to wildcard topic
  await connect(subscriber);
  await subscribe(subscriber, [{ topicFilter: wildcardTopic, qos: 1 }], 30);

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

  await subscribe(subscriber1, [{ topicFilter: wildcardTopic, qos: 2 }], 20);

  const messages: AnyPacket[] = [];
  for (let i = 0; i < 3; i++) {
    const { value: msg } = await subscriber1.next();
    messages.push(msg);
  }

  const receivedTopics = messages
    .filter((m): m is PublishPacket => m.type === PacketType.publish)
    .map((m) => m.topic)
    .sort();

  assert.deepStrictEqual(
    receivedTopics,
    [qos0topic, qos1topic, qos2topic].sort(),
    "Should receive all three retained messages",
  );

  await disconnect(subscriber1);

  const publisher2 = addMockClient(mqttServer);
  await connect(publisher2);

  // In MQTT verwijder je een retained bericht door een leeg payload te sturen met retain: true
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

  await subscribe(subscriber2, [{ topicFilter: wildcardTopic, qos: 2 }], 21);
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
  await subscribe(subscriber, [{ topicFilter: wildtopic6, qos: 2 }], 40);
  await disconnect(subscriber);

  const publisher = addMockClient(mqttServer);
  await connect(publisher);

  // Publiceer een QoS 1 en een QoS 2 bericht
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

  const messages: AnyPacket[] = [];
  for (let i = 0; i < 2; i++) {
    const { value: msg } = await subscriberReconnect.next();
    messages.push(msg);
  }

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
