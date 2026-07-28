import assert from "node:assert/strict";
import { test } from "node:test";

import {
  connect,
  connect5,
  disconnect,
  disconnect5,
  isAuthenticatedBroker,
  ping,
  publish,
  publish5,
  startMockServer,
} from "../../dev_utils/mod.ts";

import { PacketType, ReasonCode } from "../deps.ts";
import { logger, LogLevel } from "../deps.ts";
logger.level(LogLevel.debug);

test("PUBLISH QoS 0 does not receive acknowledgment", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  // Publish QoS 0
  await publish(mqttConn, "hello", 0);

  // Send PINGREQ to verify no PUBACK was queued before it
  // QoS 0 should not produce PUBACK, next response should be PINGRES
  await ping(mqttConn);

  await disconnect(mqttConn);
});

test("PUBLISH QoS 1 receives PUBACK", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  // Publish QoS 1
  await publish(mqttConn, "test/topic", 1);

  await disconnect(mqttConn);
});

test("PUBLISH QoS 2 receives PUBREC", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  // Publish QoS 2
  await publish(mqttConn, "test/topic", 2, { id: 2, payload: "hello" });
  await disconnect(mqttConn);
});

test("Publish with missing isAuthorizedToPublish handler authorizes publish", async () => {
  const { mqttConn, mqttServer } = startMockServer();
  mqttServer.handlers.isAuthorizedToPublish = undefined;

  await connect(mqttConn);
  // Try to publish to unauthorized topic
  await publish(mqttConn, "topic/unauthorized", 1, { id: 3, payload: "test" });

  await disconnect(mqttConn);
});

test("PUBLISH to unauthorized topic is rejected", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  // Try to publish to unauthorized topic
  await publish(mqttConn, "topic/unauthorized", 1, {
    id: 3,
    payload: "test",
    checkAcks: false,
  });

  await mqttConn.next();
  assert.equal(mqttConn.isClosed, true, "expect connection to be closed");
});

test("PUBLISH to $SYS topic is rejected", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  // Try to publish to $SYS topic
  await publish(mqttConn, "$SYS/broker/clients", 1, {
    id: 3,
    payload: "test",
    checkAcks: false,
  });

  await mqttConn.next();
  assert.equal(mqttConn.isClosed, true, "expect connection to be closed");
});

test("PUBLISH to $SYS topic is allowed for brokers", async () => {
  const { mqttConn, mqttServer } = startMockServer();
  // this will set the context.isBroker=true on authentication
  mqttServer.handlers.isAuthenticated = isAuthenticatedBroker;

  await connect(mqttConn, { clientId: "broker1" });
  // Try to publish to $SYS topic
  await publish(mqttConn, "$SYS/broker/clients", 0, {
    id: 3,
    payload: "test",
  });
  // connection should still be alive
  await ping(mqttConn);
  await disconnect(mqttConn);
});

// ============================================================================
// Retain Not Supported Tests
// ============================================================================

test("PUBLISH with retain when retainAvailable is false closes connection in v4", async () => {
  const { mqttConn } = startMockServer({
    configuration: { context: { retainAvailable: false } },
  });

  await connect(mqttConn);

  // Send publish with retain flag enabled
  await publish(mqttConn, "test/topic", 1, {
    id: 1,
    payload: "test",
    retain: true,
    checkAcks: false,
  });

  // Protocol level 4 should close the connection on retain error
  await mqttConn.next();
  assert.equal(mqttConn.isClosed, true, "expect connection to be closed in v4");
});

test("PUBLISH v5 with retain when retainAvailable is false receives PUBACK with retainNotSupported (QoS 1)", async () => {
  const { mqttConn } = startMockServer({
    configuration: { context: { retainAvailable: false } },
  });

  await connect5(mqttConn);

  // Send publish with retain flag enabled
  await publish5(mqttConn, "test/topic", 1, {
    id: 1,
    payload: "test",
    retain: true,
    checkAcks: false,
  });

  const { value: pubAck } = await mqttConn.next();
  assert.equal(pubAck.type, PacketType.puback, "Expected PUBACK packet");
  assert.equal(pubAck.id, 1);
  assert.equal(
    pubAck.reasonCode,
    ReasonCode.unspecifiedError,
    "Expected retainNotSupported (0x9A) reasonCode in v5",
  );

  await disconnect5(mqttConn);
});

test("PUBLISH v5 with retain when retainAvailable is false receives PUBREC with retainNotSupported (QoS 2)", async () => {
  const { mqttConn } = startMockServer({
    configuration: { context: { retainAvailable: false } },
  });

  await connect5(mqttConn);

  // Send publish with retain flag enabled
  await publish5(mqttConn, "test/topic", 2, {
    id: 2,
    payload: "test",
    retain: true,
    checkAcks: false,
  });

  const { value: pubRec } = await mqttConn.next();
  assert.equal(pubRec.type, PacketType.pubrec, "Expected PUBREC packet");
  assert.equal(pubRec.id, 2);
  assert.equal(
    pubRec.reasonCode,
    ReasonCode.unspecifiedError,
    "Expected retainNotSupported (0x9A) reasonCode in v5",
  );

  await disconnect5(mqttConn);
});

// ============================================================================
// MQTT v5 Specific Authorization Tests
// ============================================================================

test("PUBLISH v5 QoS 0 to unauthorized topic is silently dropped", async () => {
  const { mqttConn } = startMockServer();

  await connect5(mqttConn);

  // QoS 0 gets no error response message according to v5 spec
  await publish5(mqttConn, "topic/unauthorized", 0, {
    payload: "test",
    checkAcks: false,
  });

  // Verify connection is still open by executing a successful PING
  await ping(mqttConn);
  await disconnect5(mqttConn);
});

test("PUBLISH v5 QoS 1 to unauthorized topic receives PUBACK with notAuthorized", async () => {
  const { mqttConn } = startMockServer();

  await connect5(mqttConn);

  await publish5(mqttConn, "topic/unauthorized", 1, {
    id: 10,
    payload: "test",
    checkAcks: false,
  });

  const { value: pubAck } = await mqttConn.next();
  assert.equal(pubAck.type, PacketType.puback, "Expected PUBACK");
  assert.equal(pubAck.id, 10);
  assert.equal(
    pubAck.reasonCode,
    ReasonCode.notAuthorized,
    "Expected notAuthorized (0x87) reasonCode",
  );

  await disconnect5(mqttConn);
});

test("PUBLISH v5 QoS 2 to unauthorized topic receives PUBREC with notAuthorized", async () => {
  const { mqttConn } = startMockServer();

  await connect5(mqttConn);

  await publish5(mqttConn, "topic/unauthorized", 2, {
    id: 11,
    payload: "test",
    checkAcks: false,
  });

  const { value: pubRec } = await mqttConn.next();
  assert.equal(pubRec.type, PacketType.pubrec, "Expected PUBREC");
  assert.equal(pubRec.id, 11);
  assert.equal(
    pubRec.reasonCode,
    ReasonCode.notAuthorized,
    "Expected notAuthorized (0x87) reasonCode",
  );

  await disconnect5(mqttConn);
});

test("PUBLISH v5 includes reasonString when provideReasonStrings is enabled", async () => {
  const { mqttConn } = startMockServer({
    configuration: { context: { provideReasonStrings: true } },
  });

  await connect5(mqttConn);

  await publish5(mqttConn, "topic/unauthorized", 1, {
    id: 12,
    payload: "test",
    checkAcks: false,
  });

  const { value: pubAck } = await mqttConn.next();
  assert.equal(pubAck.type, PacketType.puback);
  assert.equal(pubAck.reasonCode, ReasonCode.notAuthorized);
  assert.equal(
    pubAck.properties?.reasonString,
    "Client not authorized to publish to topic/unauthorized",
  );

  await disconnect5(mqttConn);
});
