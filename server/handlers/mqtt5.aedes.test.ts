import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnyPacket } from "../deps.ts";
import { AuthenticationResult, MQTTLevel, PacketType } from "../deps.ts";
import {
  connect,
  delay,
  disconnect,
  ping,
  publish,
  startMockServer,
  startMockServer2,
  subscribe,
} from "../../dev_utils/mod.ts";

const txtEncoder = new TextEncoder();

// these tests have automatically been converted from Aedes' mqtt5.js
test("MQTT 5.0 client connects and receives a v5 CONNACK", async () => {
  const { mqttConn } = startMockServer();

  const connectPacket: AnyPacket = {
    type: PacketType.connect,
    protocolLevel: MQTTLevel.v5,
    clientId: "test-v5-client",
    clean: true,
    keepalive: 60,
  };
  await mqttConn.send(connectPacket);

  const { value: connack } = await mqttConn.next();
  assert.deepStrictEqual(connack.type, PacketType.connack, "Expected CONNACK");
  if (connack.type === PacketType.connack) {
    assert.deepStrictEqual(connack.reasonCode, 0, "Reason code should be 0 (Success)");
  }

  await disconnect(mqttConn);
});

test("MQTT 5.0 publish/subscribe round-trip", async () => {
  const { mqttConn1, mqttConn2 } = startMockServer2();

  await connect(mqttConn1, { protocolLevel: MQTTLevel.v5 });
  await connect(mqttConn2, { protocolLevel: MQTTLevel.v5 });

  await subscribe(mqttConn1, [{ topicFilter: "hello", qos: 0 }]);

  await mqttConn2.send({
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v5,
    topic: "hello",
    payload: txtEncoder.encode("world"),
    qos: 0,
  });

  const { value: msg } = await mqttConn1.next();
  assert.deepStrictEqual(msg.type, PacketType.publish);
  if (msg.type === PacketType.publish) {
    assert.deepStrictEqual(msg.topic, "hello");
    assert.deepStrictEqual(new TextDecoder().decode(msg.payload), "world");
  }

  await disconnect(mqttConn1);
  await disconnect(mqttConn2);
});

test("MQTT 5.0 properties are forwarded to subscribers", async () => {
  const { mqttConn1, mqttConn2 } = startMockServer2();

  await connect(mqttConn1, { protocolLevel: MQTTLevel.v5 });
  await connect(mqttConn2, { protocolLevel: MQTTLevel.v5 });

  await subscribe(mqttConn1, [{ topicFilter: "props/topic", qos: 0 }]);

  await mqttConn2.send({
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v5,
    topic: "props/topic",
    payload: txtEncoder.encode("payload"),
    qos: 0,
    properties: {
      contentType: "application/json",
      responseTopic: "reply/here",
      correlationData: txtEncoder.encode("corr-1"),
      userProperties: { foo: "bar" },
    },
  });

  const { value: msg } = await mqttConn1.next();
  assert.deepStrictEqual(msg.type, PacketType.publish);
  if (msg.type === PacketType.publish && msg.properties) {
    assert.deepStrictEqual(msg.properties.contentType, "application/json");
    assert.deepStrictEqual(msg.properties.responseTopic, "reply/here");
    assert.deepStrictEqual(msg.properties.userProperties, { foo: "bar" });
    assert.deepStrictEqual(
      new TextDecoder().decode(msg.properties.correlationData as Uint8Array),
      "corr-1"
    );
  }

  await disconnect(mqttConn1);
  await disconnect(mqttConn2);
});

test("MQTT 5.0 CONNACK advertises topicAliasMaximum when enabled", async () => {
  const { mqttConn, mqttServer } = startMockServer();
  
  // Configureer mock server eigenschappen
  if (mqttServer.options) {
    mqttServer.options.topicAliasMaximum = 10;
  }

  await mqttConn.send({
    type: PacketType.connect,
    protocolLevel: MQTTLevel.v5,
    clientId: "alias-max-client",
  });

  const { value: connack } = await mqttConn.next();
  if (connack.type === PacketType.connack) {
    assert.deepStrictEqual(connack.properties?.topicAliasMaximum, 10);
  }

  await disconnect(mqttConn);
});

test("MQTT 5.0 inbound topic alias is resolved and delivered with the real topic", async () => {
  const { mqttConn1, mqttConn2 } = startMockServer2();

  await connect(mqttConn1, { protocolLevel: MQTTLevel.v5 });
  await connect(mqttConn2, { protocolLevel: MQTTLevel.v5 });

  await subscribe(mqttConn1, [{ topicFilter: "alias/topic", qos: 0 }]);

  // Eerste publicatie: Registreer alias 1 voor het topic
  await mqttConn2.send({
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v5,
    topic: "alias/topic",
    payload: txtEncoder.encode("one"),
    qos: 0,
    properties: { topicAlias: 1 },
  });

  const { value: msg1 } = await mqttConn1.next();
  assert.deepStrictEqual(msg1.type, PacketType.publish);
  if (msg1.type === PacketType.publish) {
    assert.deepStrictEqual(msg1.topic, "alias/topic");
    assert.deepStrictEqual(new TextDecoder().decode(msg1.payload), "one");
  }

  // Tweede publicatie: Stuur een leeg topic met enkel de geregistreerde alias
  await mqttConn2.send({
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v5,
    topic: "",
    payload: txtEncoder.encode("two"),
    qos: 0,
    properties: { topicAlias: 1 },
  });

  const { value: msg2 } = await mqttConn1.next();
  assert.deepStrictEqual(msg2.type, PacketType.publish);
  if (msg2.type === PacketType.publish) {
    // De broker moet het lege topic resolven naar de echte waarde voor de subscriber
    assert.deepStrictEqual(msg2.topic, "alias/topic");
    assert.deepStrictEqual(new TextDecoder().decode(msg2.payload), "two");
  }

  await disconnect(mqttConn1);
  await disconnect(mqttConn2);
});

test("MQTT 5.0 subscription identifier is echoed on matching publishes", async () => {
  const { mqttConn1, mqttConn2 } = startMockServer2();

  await connect(mqttConn1, { protocolLevel: MQTTLevel.v5 });
  await connect(mqttConn2, { protocolLevel: MQTTLevel.v5 });

  // Subscribe met een subscriptionIdentifier property
  await mqttConn1.send({
    type: PacketType.subscribe,
    protocolLevel: MQTTLevel.v5,
    id: 1,
    subscriptions: [{ topicFilter: "subid/topic", qos: 0 }],
    properties: { subscriptionIdentifier: 42 },
  });
  await mqttConn1.next(); // Consumeer de suback

  await mqttConn2.send({
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v5,
    topic: "subid/topic",
    payload: txtEncoder.encode("hello"),
    qos: 0,
  });

  const { value: msg } = await mqttConn1.next();
  if (msg.type === PacketType.publish) {
    assert.deepStrictEqual(msg.properties?.subscriptionIdentifier, 42);
  }

  await disconnect(mqttConn1);
  await disconnect(mqttConn2);
});

test("MQTT 5.0 session is resumed within the expiry window", async () => {
  const { mqttConn1, mqttConn2 } = startMockServer2();
  const clientId = "expiry-resume";

  // Eerste connectie: clean session false en een sessionExpiryInterval
  await mqttConn1.send({
    type: PacketType.connect,
    protocolLevel: MQTTLevel.v5,
    clientId,
    clean: false,
    properties: { sessionExpiryInterval: 60 },
  });
  const { value: connack1 } = await mqttConn1.next();
  if (connack1.type === PacketType.connack) {
    assert.deepStrictEqual(connack1.sessionPresent, false);
  }

  await subscribe(mqttConn1, [{ topicFilter: "expiry/resume", qos: 1 }]);
  await disconnect(mqttConn1);

  // Tweede connectie (binnen de window): Herverbind met dezelfde clientId
  await mqttConn2.send({
    type: PacketType.connect,
    protocolLevel: MQTTLevel.v5,
    clientId,
    clean: false,
    properties: { sessionExpiryInterval: 60 },
  });
  const { value: connack2 } = await mqttConn2.next();
  if (connack2.type === PacketType.connack) {
    assert.deepStrictEqual(connack2.sessionPresent, true, "Session should be resumed");
  }

  await disconnect(mqttConn2);
});

test("MQTT 5.0 session is wiped after the expiry interval elapses", async () => {
  const { mqttConn1, mqttConn2 } = startMockServer2();
  const clientId = "expiry-gone";

  await mqttConn1.send({
    type: PacketType.connect,
    protocolLevel: MQTTLevel.v5,
    clientId,
    clean: false,
    properties: { sessionExpiryInterval: 1 }, // 1 seconde expiry
  });
  await mqttConn1.next();
  await disconnect(mqttConn1);

  // Wacht tot na de interval (1.5 seconde)
  await delay(1500);

  // Verbind opnieuw: de sessie moet verlopen (wiped) zijn
  await mqttConn2.send({
    type: PacketType.connect,
    protocolLevel: MQTTLevel.v5,
    clientId,
    clean: false,
  });
  const { value: connack2 } = await mqttConn2.next();
  if (connack2.type === PacketType.connack) {
    assert.deepStrictEqual(connack2.sessionPresent, false, "Expired session should be gone");
  }

  await disconnect(mqttConn2);
});

test("MQTT 5.0 session takeover sends DISCONNECT 0x8E to the old connection", async () => {
  const { mqttConn1, mqttConn2 } = startMockServer2();
  const clientId = "takeover";

  await connect(mqttConn1, { clientId, protocolLevel: MQTTLevel.v5 });

  // Stuur vanaf een tweede client een connectie met dezelfde clientId (takeover)
  await connect(mqttConn2, { clientId, protocolLevel: MQTTLevel.v5 });

  // De eerste client moet nu een DISCONNECT ontvangen met reasonCode 0x8E (Session Taken Over)
  const { value: discPacket } = await mqttConn1.next();
  assert.deepStrictEqual(discPacket.type, PacketType.disconnect);
  if (discPacket.type === PacketType.disconnect) {
    assert.deepStrictEqual(discPacket.reasonCode, 0x8E);
  }
});

test("MQTT 5.0 UNSUBACK carries reason codes and keeps the connection valid", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn, { protocolLevel: MQTTLevel.v5 });
  await subscribe(mqttConn, [{ topicFilter: "unsub/topic", qos: 0 }]);

  // Unsubscribe van een bestaand en een niet-bestaand topic
  await mqttConn.send({
    type: PacketType.unsubscribe,
    protocolLevel: MQTTLevel.v5,
    id: 2,
    unsubscriptions: ["unsub/topic", "never/subscribed"],
  });

  const { value: unsuback } = await mqttConn.next();
  assert.deepStrictEqual(unsuback.type, PacketType.unsuback);
  
  // De verbinding moet bruikbaar blijven (test met een pingreq/pingres)
  await ping(mqttConn);
  await disconnect(mqttConn);
});

test("MQTT 5.0 oversized packet is rejected with DISCONNECT 0x95", async () => {
  const { mqttConn, mqttServer } = startMockServer();
  
  if (mqttServer.options) {
    mqttServer.options.maximumPacketSize = 100;
  }

  await connect(mqttConn, { clientId: "big-pub", protocolLevel: MQTTLevel.v5 });

  // Stuur een opzettelijk te groot PUBLISH pakket
  await mqttConn.send({
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v5,
    topic: "big/topic",
    payload: txtEncoder.encode("x".repeat(500)),
    qos: 0,
  });

  const { value: response } = await mqttConn.next();
  assert.deepStrictEqual(response.type, PacketType.disconnect);
  if (response.type === PacketType.disconnect) {
    assert.deepStrictEqual(response.reasonCode, 0x95, "Should return 0x95 Packet too large");
  }
  assert.deepStrictEqual(mqttConn.isClosed, true, "Expect connection to be closed");
});

test("MQTT 5.0 unauthorized QoS1 publish is answered with 0x87 PUBACK", async () => {
  const { mqttConn, mqttServer } = startMockServer();
  
  // Injecteer een authorisatie-handler die specifieke topics weigert
  mqttServer.handlers.authorizePublish = (topic: string) => {
    return !topic.startsWith("denied");
  };

  await connect(mqttConn, { protocolLevel: MQTTLevel.v5 });

  await mqttConn.send({
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v5,
    topic: "denied/x",
    payload: txtEncoder.encode("data"),
    qos: 1,
    id: 10,
  });

  const { value: puback } = await mqttConn.next();
  assert.deepStrictEqual(puback.type, PacketType.puback);
  if (puback.type === PacketType.puback) {
    assert.deepStrictEqual(puback.reasonCode, 0x87, "Should return 0x87 Not Authorized");
  }

  // Verbinding moet open blijven
  assert.deepStrictEqual(mqttConn.isClosed, false);
  await disconnect(mqttConn);
});

test("MQTT 5.0 a denied SUBSCRIBE returns SUBACK reason code 0x87", async () => {
  const { mqttConn, mqttServer } = startMockServer();
  
  mqttServer.handlers.authorizeSubscribe = (topic: string) => {
    return topic !== "denied";
  };

  await connect(mqttConn, { protocolLevel: MQTTLevel.v5 });

  await mqttConn.send({
    type: PacketType.subscribe,
    protocolLevel: MQTTLevel.v5,
    id: 1,
    subscriptions: [{ topicFilter: "denied", qos: 0 }],
  });

  const { value: suback } = await mqttConn.next();
  assert.deepStrictEqual(suback.type, PacketType.suback);
  if (suback.type === PacketType.suback) {
    assert.deepStrictEqual(suback.reasonCodes, [0x87], "Expect 0x87 in reasonCodes");
  }

  await disconnect(mqttConn);
});


// ==========================================
// AANVULLENDE & GEAVANCEERDE MQTT 5.0 TESTEN
// ==========================================

test("MQTT 5.0 subscription identifier survives a non-clean reconnect", async () => {
  const { mqttConn1, mqttConn2, mqttConn3 } = startMockServer3();
  const clientId = "subid-persist";

  // Eerste sessie: clean: false met sessionExpiryInterval en een subscriptionIdentifier
  await mqttConn1.send({
    type: PacketType.connect,
    protocolLevel: MQTTLevel.v5,
    clientId,
    clean: false,
    properties: { sessionExpiryInterval: 60 },
  });
  await mqttConn1.next(); // Consumeer CONNACK

  await mqttConn1.send({
    type: PacketType.subscribe,
    protocolLevel: MQTTLevel.v5,
    id: 1,
    subscriptions: [{ topicFilter: "subid/persist", qos: 1 }],
    properties: { subscriptionIdentifier: 7 },
  });
  await mqttConn1.next(); // Consumeer SUBACK
  await disconnect(mqttConn1);

  // Tweede sessie (reconnect): De subscription identifier moet uit persistence herladen worden
  await mqttConn2.send({
    type: PacketType.connect,
    protocolLevel: MQTTLevel.v5,
    clientId,
    clean: false,
  });
  await mqttConn2.next(); // Consumeer CONNACK

  // Publisher stuurt een bericht naar het topic
  await connect(mqttConn3, { protocolLevel: MQTTLevel.v5 });
  await mqttConn3.send({
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v5,
    topic: "subid/persist",
    payload: txtEncoder.encode("after-reconnect"),
    qos: 1,
    id: 10,
  });

  // De subscriber (mqttConn2) moet het bericht ontvangen inclusief de opgeslagen subscription identifier
  const { value: msg } = await mqttConn2.next();
  assert.deepStrictEqual(msg.type, PacketType.publish);
  if (msg.type === PacketType.publish) {
    assert.deepStrictEqual(msg.properties?.subscriptionIdentifier, 7);
  }

  await disconnect(mqttConn2);
  await disconnect(mqttConn3);
});

test("MQTT 5.0 will delay interval defers the will, then publishes it", async () => {
  const { mqttConn1, mqttConn2 } = startMockServer2();

  // Watcher verbindt en subscribeert op het will-topic
  await connect(mqttConn1, { protocolLevel: MQTTLevel.v5 });
  await subscribe(mqttConn1, [{ topicFilter: "willdelay/topic", qos: 0 }]);

  // Client met een vertraagde Will (Will Delay Interval) verbindt
  await mqttConn2.send({
    type: PacketType.connect,
    protocolLevel: MQTTLevel.v5,
    clientId: "willdelay-client",
    properties: { sessionExpiryInterval: 60 },
    will: {
      topic: "willdelay/topic",
      payload: txtEncoder.encode("delayed-bye"),
      qos: 0,
      properties: { willDelayInterval: 1 }, // 1 seconde uitstel
    },
  });
  await mqttConn2.next();

  // Abrupt verbreken van de verbinding (simuleer socket close zonder DISCONNECT)
  mqttConn2.close();

  // Controleer dat het testament NIET direct geplaatst is
  const earlyCheck = Promise.race([
    mqttConn1.next().then(() => "message_received"),
    delay(300).then(() => "still_waiting"),
  ]);
  assert.deepStrictEqual(await earlyCheck, "still_waiting");

  // Wacht tot de interval verstreken is en controleer dat het bericht nu wel aankomt
  const delayedCheck = Promise.race([
    mqttConn1.next().then(({ value }) => value),
    delay(1500).then(() => null),
  ]);
  
  const msg = await delayedCheck;
  assert.ok(msg);
  if (msg && msg.type === PacketType.publish) {
    assert.deepStrictEqual(new TextDecoder().decode(msg.payload), "delayed-bye");
  }

  await disconnect(mqttConn1);
});

test("MQTT 5.0 will delay is cancelled when the client reconnects", async () => {
  const { mqttConn1, mqttConn2, mqttServer } = startMockServer2();
  const clientId = "willcancel-client";

  // Verbind met een actieve langdurige Will Delay
  await mqttConn1.send({
    type: PacketType.connect,
    protocolLevel: MQTTLevel.v5,
    clientId,
    properties: { sessionExpiryInterval: 60 },
    will: {
      topic: "willcancel/topic",
      payload: txtEncoder.encode("should-not-arrive"),
      qos: 0,
      properties: { willDelayInterval: 60 }, // 60 seconden uitstel
    },
  });
  await mqttConn1.next();
  mqttConn1.close(); // Abrupt loss

  // Controleer intern in de broker-mock of de delayed will geregistreerd staat
  if (mqttServer.delayedWills) {
    assert.deepStrictEqual(mqttServer.delayedWills.has(clientId), true);
  }

  // Herverbinden onder hetzelfde clientId moet de openstaande delayed will per direct annuleren
  await mqttConn2.send({
    type: PacketType.connect,
    protocolLevel: MQTTLevel.v5,
    clientId,
    clean: false,
  });
  await mqttConn2.next();

  if (mqttServer.delayedWills) {
    assert.deepStrictEqual(mqttServer.delayedWills.has(clientId), false, "Pending will must be cancelled");
  }

  await disconnect(mqttConn2);
});

test("MQTT 5.0 CONNACK advertises shared subscriptions as unavailable", async () => {
  const { mqttConn } = startMockServer();

  await mqttConn.send({
    type: PacketType.connect,
    protocolLevel: MQTTLevel.v5,
    clientId: "shared-check",
  });

  const { value: connack } = await mqttConn.next();
  if (connack.type === PacketType.connack) {
    assert.deepStrictEqual(connack.properties?.sharedSubscriptionAvailable, false);
  }
  await disconnect(mqttConn);
});

test("MQTT 5.0 queued message past its expiry interval is dropped", async () => {
  const { mqttConn1, mqttConn2, mqttConn3 } = startMockServer3();
  const clientId = "msgexp-sub";

  await mqttConn1.send({
    type: PacketType.connect,
    protocolLevel: MQTTLevel.v5,
    clientId,
    clean: false,
    properties: { sessionExpiryInterval: 60 },
  });
  await mqttConn1.next();
  await subscribe(mqttConn1, [{ topicFilter: "msgexp/topic", qos: 1 }]);
  await disconnect(mqttConn1);

  // Publisher stuurt een bericht met een flinterdunne messageExpiryInterval (1s)
  await connect(mqttConn2, { protocolLevel: MQTTLevel.v5 });
  await mqttConn2.send({
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v5,
    topic: "msgexp/topic",
    payload: txtEncoder.encode("too-late"),
    qos: 1,
    id: 20,
    properties: { messageExpiryInterval: 1 },
  });
  await mqttConn2.next(); // Consumeer PUBACK
  await disconnect(mqttConn2);

  // Laat het bericht verlopen
  await delay(1300);

  // Subscriber komt weer online: mag het verlopen offline-bericht NIET ontvangen
  await mqttConn3.send({
    type: PacketType.connect,
    protocolLevel: MQTTLevel.v5,
    clientId,
    clean: false,
  });
  await mqttConn3.next();

  const race = Promise.race([
    mqttConn3.next().then(() => "msg_delivered"),
    delay(400).then(() => "timeout"),
  ]);
  assert.deepStrictEqual(await race, "timeout");

  await disconnect(mqttConn3);
});

test("MQTT 5.0 queued message within expiry is delivered with the remaining lifetime", async () => {
  const { mqttConn1, mqttConn2, mqttConn3 } = startMockServer3();
  const clientId = "msgexp2-sub";

  await mqttConn1.send({
    type: PacketType.connect,
    protocolLevel: MQTTLevel.v5,
    clientId,
    clean: false,
    properties: { sessionExpiryInterval: 60 },
  });
  await mqttConn1.next();
  await subscribe(mqttConn1, [{ topicFilter: "msgexp2/topic", qos: 1 }]);
  await disconnect(mqttConn1);

  // Publish offline met 60s lifetime
  await connect(mqttConn2, { protocolLevel: MQTTLevel.v5 });
  await mqttConn2.send({
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v5,
    topic: "msgexp2/topic",
    payload: txtEncoder.encode("in-time"),
    qos: 1,
    id: 30,
    properties: { messageExpiryInterval: 60 },
  });
  await mqttConn2.next();
  await disconnect(mqttConn2);

  // Kom direct weer online
  await mqttConn3.send({
    type: PacketType.connect,
    protocolLevel: MQTTLevel.v5,
    clientId,
    clean: false,
  });
  await mqttConn3.next();

  const { value: msg } = await mqttConn3.next();
  assert.deepStrictEqual(msg.type, PacketType.publish);
  if (msg.type === PacketType.publish) {
    assert.deepStrictEqual(new TextDecoder().decode(msg.payload), "in-time");
    const remaining = msg.properties?.messageExpiryInterval ?? 0;
    assert.ok(remaining >= 55 && remaining <= 60, `Remaining lifetime should be evaluated but got ${remaining}`);
  }

  await disconnect(mqttConn3);
});

test("MQTT 5.0 CONNACK advertises flow-control limits", async () => {
  const { mqttConn, mqttServer } = startMockServer();
  
  if (mqttServer.options) {
    mqttServer.options.maximumPacketSize = 256;
    mqttServer.options.receiveMaximum = 20;
  }

  await mqttConn.send({
    type: PacketType.connect,
    protocolLevel: MQTTLevel.v5,
    clientId: "flow-control",
  });

  const { value: connack } = await mqttConn.next();
  if (connack.type === PacketType.connack) {
    assert.deepStrictEqual(connack.properties?.maximumPacketSize, 256);
    assert.deepStrictEqual(connack.properties?.receiveMaximum, 20);
  }
  await disconnect(mqttConn);
});

test("MQTT 5.0 oversized pre-auth CONNECT is dropped via preconnect handler", async () => {
  const { mqttConn, mqttServer } = startMockServer();
  
  if (mqttServer.options) {
    mqttServer.options.maximumPacketSize = 50;
  }

  let errorTriggered = false;
  mqttServer.handlers.preconnect = (_context: any) => {
    errorTriggered = true;
    mqttConn.close(); 
  };

  // Gebruik mqttConn.rawSend om een te grote brute buffer over de lijn te jagen
  // (Pusht het CONNECT pakket ver voorbij de gesimuleerde 50 bytes limiet)
  const oversizedBuffer = new Uint8Array(200);
  oversizedBuffer[0] = 0x10; // Connect command byte
  oversizedBuffer[1] = 198;  // Length header
  await mqttConn.rawSend(oversizedBuffer);

  await mqttConn.next();
  assert.deepStrictEqual(errorTriggered, true, "Broker preconnect hook should block oversized frame");
  assert.deepStrictEqual(mqttConn.isClosed, true);
});

test("MQTT 5.0 expired retained message is not delivered to new subscribers", async () => {
  const { mqttConn1, mqttConn2 } = startMockServer2();

  await connect(mqttConn1, { protocolLevel: MQTTLevel.v5 });
  await mqttConn1.send({
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v5,
    topic: "ret/exp",
    payload: txtEncoder.encode("gone"),
    retain: true,
    qos: 0,
    properties: { messageExpiryInterval: 1 }, // 1 seconde lifetime
  });
  await ping(mqttConn1); // Settle
  await disconnect(mqttConn1);

  // Wacht tot het retained bericht verdampt is
  await delay(1300);

  // Nieuwe subscriber mag niks krijgen
  await connect(mqttConn2, { protocolLevel: MQTTLevel.v5 });
  await subscribe(mqttConn2, [{ topicFilter: "ret/exp", qos: 0 }]);

  const race = Promise.race([
    mqttConn2.next().then(() => "msg_delivered"),
    delay(400).then(() => "timeout"),
  ]);
  assert.deepStrictEqual(await race, "timeout");
  await disconnect(mqttConn2);
});

test("MQTT 5.0 retained message within expiry is delivered with remaining lifetime", async () => {
  const { mqttConn1, mqttConn2 } = startMockServer2();

  await connect(mqttConn1, { protocolLevel: MQTTLevel.v5 });
  await mqttConn1.send({
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v5,
    topic: "ret/live",
    payload: txtEncoder.encode("here"),
    retain: true,
    qos: 0,
    properties: { messageExpiryInterval: 60 },
  });
  await ping(mqttConn1);
  await disconnect(mqttConn1);

  await connect(mqttConn2, { protocolLevel: MQTTLevel.v5 });
  await subscribe(mqttConn2, [{ topicFilter: "ret/live", qos: 0 }]);

  const { value: msg } = await mqttConn2.next();
  assert.deepStrictEqual(msg.type, PacketType.publish);
  if (msg.type === PacketType.publish) {
    assert.deepStrictEqual(new TextDecoder().decode(msg.payload), "here");
    const remaining = msg.properties?.messageExpiryInterval ?? 0;
    assert.ok(remaining >= 55 && remaining <= 60);
  }
  await disconnect(mqttConn2);
});

test("MQTT 5.0 unauthorized QoS2 publish is answered with 0x87 (PUBREC)", async () => {
  const { mqttConn, mqttServer } = startMockServer();
  
  mqttServer.handlers.authorizePublish = (topic: string) => {
    return !topic.startsWith("denied");
  };

  await connect(mqttConn, { protocolLevel: MQTTLevel.v5 });

  await mqttConn.send({
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v5,
    topic: "denied/qos2",
    payload: txtEncoder.encode("data"),
    qos: 2,
    id: 42,
  });

  const { value: pubrec } = await mqttConn.next();
  assert.deepStrictEqual(pubrec.type, PacketType.pubrec);
  if (pubrec.type === PacketType.pubrec) {
    assert.deepStrictEqual(pubrec.reasonCode, 0x87, "QoS 2 path answers with 0x87 PUBREC");
  }

  assert.deepStrictEqual(mqttConn.isClosed, false, "Connection stays up");
  await disconnect(mqttConn);
});

test("MQTT 5.0 unauthorized publish PUBACK carries a Reason String based on Request Problem Information", async () => {
  const { mqttConn1, mqttConn2, mqttServer } = startMockServer2();
  
  mqttServer.handlers.authorizePublish = () => false; // Weiger alles
  mqttServer.handlers.getReasonString = () => "not allowed here";

  // Client 1: Vraagt wél om probleem info (default true)
  await mqttConn1.send({
    type: PacketType.connect,
    protocolLevel: MQTTLevel.v5,
    clientId: "rpi-on",
    properties: { requestProblemInformation: true },
  });
  await mqttConn1.next();

  await mqttConn1.send({
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v5,
    topic: "secure/x",
    payload: txtEncoder.encode("d"),
    qos: 1,
    id: 50,
  });

  const { value: puback1 } = await mqttConn1.next();
  if (puback1.type === PacketType.puback) {
    assert.deepStrictEqual(puback1.reasonCode, 0x87);
    assert.deepStrictEqual(puback1.properties?.reasonString, "not allowed here");
  }
  await disconnect(mqttConn1);

  // Client 2: Onderdrukt probleem info expliciet
  await mqttConn2.send({
    type: PacketType.connect,
    protocolLevel: MQTTLevel.v5,
    clientId: "rpi-off",
    properties: { requestProblemInformation: false },
  });
  await mqttConn2.next();

  await mqttConn2.send({
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v5,
    topic: "secure/y",
    payload: txtEncoder.encode("d"),
    qos: 1,
    id: 51,
  });

  const { value: puback2 } = await mqttConn2.next();
  if (puback2.type === PacketType.puback) {
    assert.deepStrictEqual(puback2.reasonCode, 0x87);
    assert.deepStrictEqual(puback2.properties?.reasonString, undefined, "Reason String must be omitted when RPI=false");
  }
  await disconnect(mqttConn2);
});

test("MQTT 5.0 a rejecting PUBREC (reason >= 0x80) ends QoS 2 without a PUBREL", async () => {
  const { mqttConn1, mqttConn2 } = startMockServer2();

  await connect(mqttConn1, { protocolLevel: MQTTLevel.v5 });
  await subscribe(mqttConn1, [{ topicFilter: "q2/reject", qos: 2 }]);

  await connect(mqttConn2, { protocolLevel: MQTTLevel.v5 });
  await mqttConn2.send({
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v5,
    topic: "q2/reject",
    payload: txtEncoder.encode("x"),
    qos: 2,
    id: 60,
  });

  // Subscriber krijgt het bericht van de broker geleverd
  const { value: deliveredMsg } = await mqttConn1.next();
  assert.deepStrictEqual(deliveredMsg.type, PacketType.publish);

  if (deliveredMsg.type === PacketType.publish) {
    // Subscriber weigert direct bij de broker met een foutieve PUBREC code (0x87)
    await mqttConn1.send({
      type: PacketType.pubrec,
      protocolLevel: MQTTLevel.v5,
      id: deliveredMsg.id,
      reasonCode: 0x87,
    });
  }

  // De broker hoeft nu GEEN PUBREL meer te sturen naar de subscriber, de QoS 2 transactie stopt direct
  const checkNoPubrel = Promise.race([
    mqttConn1.next().then(() => "received_unexpected_packet"),
    delay(200).then(() => "no_pubrel_arrived"),
  ]);
  assert.deepStrictEqual(await checkNoPubrel, "no_pubrel_arrived");

  await disconnect(mqttConn1);
  await disconnect(mqttConn2);
});

test("MQTT 5.0 returns an Assigned Client Identifier for an empty clientId", async () => {
  const { mqttConn, mqttServer } = startMockServer();

  await mqttConn.send({
    type: PacketType.connect,
    protocolLevel: MQTTLevel.v5,
    clientId: "", // Lege string activeert dynamic ID toewijzing
  });

  const { value: connack } = await mqttConn.next();
  assert.deepStrictEqual(connack.type, PacketType.connack);
  if (connack.type === PacketType.connack) {
    const assigned = connack.properties?.assignedClientIdentifier;
    assert.ok(assigned, "Broker must supply an assigned identifier");
    
    // De server moet de client onder die nieuwe ID opslaan
    if (mqttServer.clients) {
      assert.ok(mqttServer.clients[assigned], "Client should be indexed under assigned ID");
    }
  }

  await disconnect(mqttConn);
});

test("MQTT 5.0 handles Response Information gates when requested", async () => {
  const { mqttConn1, mqttConn2, mqttServer } = startMockServer2();
  
  if (mqttServer.options) {
    mqttServer.options.responseInformation = "resp/base";
  }

  // Case A: Opgevraagd (requestResponseInformation = true)
  await mqttConn1.send({
    type: PacketType.connect,
    protocolLevel: MQTTLevel.v5,
    clientId: "ri-on",
    properties: { requestResponseInformation: true },
  });
  const { value: ca1 } = await mqttConn1.next();
  if (ca1.type === PacketType.connack) {
    assert.deepStrictEqual(ca1.properties?.responseInformation, "resp/base");
  }
  await disconnect(mqttConn1);

  // Case B: Niet opgevraagd (undefined / false)
  await mqttConn2.send({
    type: PacketType.connect,
    protocolLevel: MQTTLevel.v5,
    clientId: "ri-off",
    properties: { requestResponseInformation: false },
  });
  const { value: ca2 } = await mqttConn2.next();
  if (ca2.type === PacketType.connack) {
    assert.deepStrictEqual(ca2.properties?.responseInformation, undefined);
  }
  await disconnect(mqttConn2);
});

test("MQTT 5.0 preConnect can redirect a client with CONNACK 0x9C + Server Reference", async () => {
  const { mqttConn, mqttServer } = startMockServer();
  
  // Configureer de preConnect hook om een redirect-fout terug te sturen
  mqttServer.handlers.preconnect = (context: any) => {
    context.reasonCode = 0x9C; // Use another server
    context.serverReference = "other-host:1883";
  };

  await mqttConn.send({
    type: PacketType.connect,
    protocolLevel: MQTTLevel.v5,
    clientId: "redir-pc",
  });

  const { value: connack } = await mqttConn.next();
  assert.deepStrictEqual(connack.type, PacketType.connack);
  if (connack.type === PacketType.connack) {
    assert.deepStrictEqual(connack.reasonCode, 0x9C);
    assert.deepStrictEqual(connack.properties?.serverReference, "other-host:1883");
  }

  await mqttConn.next();
  assert.deepStrictEqual(mqttConn.isClosed, true, "Connection must be severed after redirect");
});