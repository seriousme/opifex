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

  // We sturen een ping naar de broker. Als de broker de ping beantwoordt
  // zonder dat er een PUBLISH tussendoor is gekomen, weten we zeker dat het leeg is.
  await ping(subscriber);

  await disconnect(subscriber);
});

test("SUBSCRIBE receives retained messages and clearing works", async () => {
  const { mqttConn: publisher1, mqttServer } = startMockServer();

  const qos0topic = "fromb/qos 0";
  const qos1topic = "fromb/qos 1";
  const qos2topic = "fromb/qos2";
  const wildcardTopic = "fromb/+";

  // ============================================================================
  // DEEL 1: Retained berichten publiceren en ontvangen
  // ============================================================================

  await connect(publisher1);

  // Publiceer 3 retained berichten met verschillende QoS niveaus
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

  // Verbind de tweede client om de retained berichten op te halen
  const subscriber1 = addMockClient(mqttServer);
  await connect(subscriber1);

  // Abonneer op de wildcard topic
  await subscribe(subscriber1, [{ topicFilter: wildcardTopic, qos: 2 }], 20);

  // Verzamel de 3 retained berichten
  const messages: AnyPacket[] = [];
  for (let i = 0; i < 3; i++) {
    const { value: msg } = await subscriber1.next();
    messages.push(msg);
  }

  // Filter en sorteer de topics om te verifiëren dat ze allemaal zijn aangekomen
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

  // ============================================================================
  // DEEL 2: Retained berichten verwijderen (opschonen)
  // ============================================================================

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
  // Verbind een nieuwe client om te controleren of de berichten echt weg zijn
  await connect(subscriber2);

  // Opnieuw abonneren
  await subscribe(subscriber2, [{ topicFilter: wildcardTopic, qos: 2 }], 21);

  // Stuur een ping om te controleren dat er geen retained berichten meer binnenkomen
  await ping(subscriber2);

  await disconnect(subscriber2);
});
