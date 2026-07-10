import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnyPacket, PublishPacket } from "../deps.ts";
import { PacketType } from "../deps.ts";
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

import { logger, LogLevel } from "../deps.ts";

logger.level(LogLevel.verbose);

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
  const { mqttConn: subscriber, mqttServer } = startMockServer(
    sqlitePersistence,
  );
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
