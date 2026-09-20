import { test } from "node:test";
import assert from "node:assert/strict";
import {
  connect,
  connect5,
  disconnect,
  disconnect5,
  startMockServer,
  subscribe,
  subscribe5,
  unsubscribe,
  unsubscribe5,
} from "../../dev_utils/mod.ts";
import { ReasonCode } from "../deps.ts";

test("UNSUBSCRIBE returns UNSUBACK", async () => {
  const { mqttConn } = startMockServer();

  // Connect first
  await connect(mqttConn);

  // Subscribe first
  await subscribe(mqttConn, [{ topicFilter: "test/topic", qos: 0 }]);

  // Unsubscribe
  await unsubscribe(mqttConn, ["test/topic"], { id: 2 });
  await disconnect(mqttConn);
});

test("UNSUBSCRIBE from multiple topics returns UNSUBACK", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  // Subscribe to multiple topics
  await subscribe(mqttConn, [
    { topicFilter: "topic/one", qos: 0 },
    { topicFilter: "topic/two", qos: 0 },
  ]);

  // Unsubscribe from both
  await unsubscribe(mqttConn, ["topic/one", "topic/two"], { id: 3 });
  await disconnect(mqttConn);
});

test("UNSUBSCRIBE from non-existent subscription still returns UNSUBACK", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  // Unsubscribe without subscribing first,should still get a SUBACK
  await unsubscribe(mqttConn, ["nonexistent/topic"], { id: 3 });
  await disconnect(mqttConn);
});

test("V5 UNSUBSCRIBE from multiple subscriptions gives correct reasonCodes", async () => {
  const { mqttConn } = startMockServer();

  await connect5(mqttConn);
  // Subscribe to multiple topics
  await subscribe5(mqttConn, [
    { topicFilter: "topic/one", qos: 0 },
    { topicFilter: "topic/two", qos: 0 },
  ]);

  const unsuback = await unsubscribe5(mqttConn, [
    "topic/one",
    "topic/two",
    "nonexistent/topic",
  ], { id: 3 });
  assert.equal(unsuback.protocolLevel, 5, "V5 packet");
  assert.deepStrictEqual(unsuback.reasonCodes, [
    ReasonCode.success,
    ReasonCode.success,
    ReasonCode.noSubscriptionExisted,
  ]);

  await disconnect5(mqttConn);
});
