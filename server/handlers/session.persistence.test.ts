import assert from "node:assert/strict";
import { test } from "node:test";
import { PacketType } from "../deps.ts";
import {
  addMockClient,
  connect,
  disconnect,
  startMockServer,
  subscribe,
} from "../../dev_utils/mod.ts";

test("sessionPresent is false for new client", async () => {
  const { mqttConn } = startMockServer();

  const connack = await connect(mqttConn, {
    clientId: "new-client",
    clean: false,
  });

  assert.deepStrictEqual(
    connack.sessionPresent,
    false,
    "Expected sessionPresent=false for new client",
  );

  await disconnect(mqttConn);
});

test("sessionPresent is true when reconnecting with same clientId and clean=false", async () => {
  const { mqttConn: mqttConn1, mqttServer } = startMockServer();

  const clientId = "persist-client";
  // First connection
  const connack1 = await connect(mqttConn1, {
    clientId,
    clean: false,
  });

  if (connack1.type === PacketType.connack) {
    assert.deepStrictEqual(
      connack1.sessionPresent,
      false,
      "Expected sessionPresent=false for first connection",
    );
  }
  await disconnect(mqttConn1);

  // Second connection with same clientId and clean=false
  const mqttConn2 = addMockClient(mqttServer);
  const connack2 = await connect(mqttConn2, {
    clientId,
    clean: false,
  });

  assert.deepStrictEqual(
    connack2.sessionPresent,
    true,
    "Expected sessionPresent=true for reconnection with clean=false",
  );
  await disconnect(mqttConn2);
});

test("subscriptions persist with clean=false", async () => {
  function subsMap(subs: { topicFilter: string; qos: number }[]) {
    const result = new Map();
    for (const { topicFilter, qos } of subs) {
      result.set(topicFilter, qos);
    }
    return result;
  }
  const { mqttConn: mqttConn1, mqttServer } = startMockServer();
  const clientId = "subscription-persist-client";

  // First connection
  await connect(mqttConn1, {
    clientId,
    clean: false,
  });

  await subscribe(mqttConn1, [
    { topicFilter: "sensors/temperature", qos: 1 },
    { topicFilter: "sensors/humidity", qos: 2 },
  ], { id: 1 });
  await disconnect(mqttConn1);

  // Verify subscriptions are stored
  const client1Subs = await Array.fromAsync(
    mqttServer.persistence.listSubscriptions(clientId),
  );
  assert.strictEqual(
    client1Subs.length,
    2,
    "Expected 2 subscriptions after first connection",
  );
  const client1subsMap = subsMap(client1Subs);
  assert.strictEqual(
    client1subsMap.get("sensors/temperature"),
    1,
    "Expected sensors/temperature with QoS 1",
  );
  assert.strictEqual(
    client1subsMap.get("sensors/humidity"),
    2,
    "Expected sensors/humidity with QoS 2",
  );

  // Second connection with clean=false
  const mqttConn2 = addMockClient(mqttServer);
  const connack2 = await connect(mqttConn2, {
    clientId,
    clean: false,
  });

  if (connack2.type === PacketType.connack) {
    assert.deepStrictEqual(
      connack2.sessionPresent,
      true,
      "Expected sessionPresent=true on reconnection",
    );
  }

  // Verify subscriptions are restored
  const client2Subs = await Array.fromAsync(
    mqttServer.persistence.listSubscriptions(clientId),
  );
  assert.strictEqual(
    client1Subs.length,
    2,
    "Expected 2 subscriptions after reconnection",
  );
  const client2subsMap = subsMap(client2Subs);
  assert.strictEqual(
    client2subsMap.get("sensors/temperature"),
    1,
    "Expected sensors/temperature with QoS 1",
  );
  assert.strictEqual(
    client2subsMap.get("sensors/humidity"),
    2,
    "Expected sensors/humidity with QoS 2",
  );

  await disconnect(mqttConn2);
});

test("subscriptions cleared with clean=true", async () => {
  const { mqttConn: mqttConn1, mqttServer } = startMockServer();
  const clientId = "clean-client";

  // First connection - subscribe to topics
  await connect(mqttConn1, {
    clientId,
    clean: false,
  });

  await subscribe(mqttConn1, [{ topicFilter: "device/status", qos: 0 }], {
    id: 1,
  });
  await disconnect(mqttConn1);

  // Verify subscriptions are stored
  const storedSubs = await Array.fromAsync(
    mqttServer.persistence.listSubscriptions(clientId),
  );
  assert.strictEqual(
    storedSubs.length,
    1,
    "Expected 1 subscription after first connection",
  );

  // Second connection with clean=true
  const mqttConn2 = addMockClient(mqttServer);
  const connack2 = await connect(mqttConn2, {
    clientId,
    clean: true,
  });

  assert.deepStrictEqual(
    connack2.sessionPresent,
    false,
    "Expected sessionPresent=false when clean=true",
  );

  const cleanedSubs = await Array.fromAsync(
    mqttServer.persistence.listSubscriptions(clientId),
  );
  assert.strictEqual(
    cleanedSubs.length,
    0,
    "Expected subscriptions to be cleared with clean=true",
  );

  await disconnect(mqttConn2);
});
