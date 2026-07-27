import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AuthenticationResult,
  MQTTLevel,
  PacketType,
  ReasonCode,
} from "../deps.ts";
import {
  addMockClient,
  connect,
  connect5,
  disconnect,
  disconnect5,
  ping,
  publish,
  startMockServer,
  subscribe,
} from "../../dev_utils/mod.ts";
import { createConfiguration } from "../config.ts";

const configuration = createConfiguration();
const txtEncoder = new TextEncoder();

test("Authentication with valid username and password works", async () => {
  const { mqttConn } = startMockServer();
  const connack = await connect(mqttConn);
  assert.deepStrictEqual(
    connack.returnCode,
    AuthenticationResult.ok,
    "Expected OK",
  );
  await disconnect(mqttConn);
});

test("Authentication with invalid username fails", async () => {
  const { mqttConn } = startMockServer();
  const connack = await connect(mqttConn, { username: "wrong" });

  assert.deepStrictEqual(
    connack.returnCode,
    AuthenticationResult.badUsernameOrPassword,
    "Expected badUsernameOrPassword",
  );

  await mqttConn.next();
  assert.deepStrictEqual(
    mqttConn.isClosed,
    true,
    "Expected connection to be closed",
  );
});

test("Authentication with invalid password fails", async () => {
  const { mqttConn } = startMockServer();
  const connack = await connect(mqttConn, { password: "" });

  assert.deepStrictEqual(
    connack.returnCode,
    AuthenticationResult.badUsernameOrPassword,
    "Expected badUsernameOrPassword",
  );

  await mqttConn.next();
  assert.deepStrictEqual(
    mqttConn.isClosed,
    true,
    "Expected connection to be closed",
  );
});

test("Two connect messages on same connection closes connection", async () => {
  const { mqttConn } = startMockServer();

  const connack = await connect(mqttConn);
  assert.deepStrictEqual(
    connack.returnCode,
    AuthenticationResult.ok,
    "Expected OK",
  );

  const connack2 = await connect(mqttConn, { checkAck: false });
  assert.deepStrictEqual(connack2, undefined, "Expected no second connack");
  assert.deepStrictEqual(
    mqttConn.isClosed,
    true,
    "Expected connection to be closed",
  );
});

test("Second session with same client id closes the first", async () => {
  const clientId = "doubleClient";
  const { mqttConn: mqttConn1, mqttServer } = startMockServer();
  // start first client
  await connect(mqttConn1, { clientId });

  // start second client with same id
  const mqttConn2 = addMockClient(mqttServer);
  await connect(mqttConn2, { clientId });

  await mqttConn1.next();
  assert.deepStrictEqual(
    mqttConn1.isClosed,
    true,
    "Expected first connection to be closed",
  );
  assert.deepStrictEqual(
    mqttConn2.isClosed,
    false,
    "Expected second connection not to be closed",
  );
  await disconnect(mqttConn2);
});

test("Redelivery on reconnect after failed delivery", async () => {
  const clientId = "redeliveryClient";
  const topic = "no/retained/here";
  const { mqttConn: mqttConn1, mqttServer } = startMockServer();
  // start first client, clean needs to be false or else client state whill be wiped on disconnect
  await connect(mqttConn1, { clientId, clean: false });
  // Subscribe to topic with no retained message
  await subscribe(mqttConn1, [{ topicFilter: topic, qos: 1 }]);
  // the first packet returned will be the publish, not the ack.
  await publish(mqttConn1, topic, 1, { checkAcks: false });
  // first reception on our subscription
  const { value: publishPacket } = await mqttConn1.next();
  assert.deepStrictEqual(
    publishPacket.type,
    PacketType.publish,
    "received publish packet again",
  );
  const publishId = publishPacket.id;
  await mqttConn1.next(); // the puback on the publish we sent out
  await disconnect(mqttConn1);
  assert.deepStrictEqual(
    mqttConn1.isClosed,
    true,
    "Expected first connection to be closed",
  );
  // connect again with same clientId
  const mqttConn2 = addMockClient(mqttServer);
  await connect(mqttConn2, { clientId, clean: false });
  // expect published packet to be redelivered because we did not ack
  const { value: packet } = await mqttConn2.next();
  assert.deepStrictEqual(
    packet.type,
    PacketType.publish,
    "received publish packet again",
  );
  assert.deepStrictEqual(
    packet.id,
    publishId,
    "packetid is the same as on original delivery",
  );
  await disconnect(mqttConn2);
});

test("Delivery of messages with QoS 1 or QoS2 received while offline", async () => {
  const clientId = "offlineClient";
  const { mqttConn: mqttConn1, mqttServer } = startMockServer();
  // start first client
  await connect(mqttConn1, { clientId, clean: false });
  // Subscribe to topic with no retained message
  await subscribe(mqttConn1, [{ topicFilter: "offline/+", qos: 1 }]);
  // hangup
  await disconnect(mqttConn1);

  //  connect the publisher
  const mqttConn2 = addMockClient(mqttServer);
  await connect(mqttConn2, { clientId: "publisher" });
  await publish(mqttConn2, "offline/q0", 0, { id: 10 });
  await publish(mqttConn2, "offline/q1", 1, { id: 11 });
  await publish(mqttConn2, "offline/q2", 2, { id: 12 });
  await disconnect(mqttConn2);

  // connect again with same clientId as the initial connect
  const mqttConn3 = addMockClient(mqttServer);
  await connect(mqttConn3, { clientId, clean: false });
  // expect published packet that was delivered while offline
  const { value: packetQos1 } = await mqttConn3.next();
  assert.deepStrictEqual(
    packetQos1.type,
    PacketType.publish,
    "received publish packet",
  );
  assert.deepStrictEqual(
    packetQos1.topic,
    "offline/q1",
    "topic is expected",
  );
  const { value: packetQos2 } = await mqttConn3.next();
  assert.deepStrictEqual(
    packetQos2.type,
    PacketType.publish,
    "received publish packet",
  );
  assert.deepStrictEqual(
    packetQos2.topic,
    "offline/q2",
    "topic is expected",
  );
  await ping(mqttConn3);
  await disconnect(mqttConn3);
});

test("Delivery of messages with QoS 1 or QoS2 not received while offline when clean = true", async () => {
  const clientId = "offlineClient";
  const { mqttConn: mqttConn1, mqttServer } = startMockServer();
  // start first client
  await connect(mqttConn1, { clientId, clean: true });
  // Subscribe to topic with no retained message
  await subscribe(mqttConn1, [{ topicFilter: "offline/+", qos: 1 }]);
  // hangup
  await disconnect(mqttConn1);

  //  connect the publisher
  const mqttConn2 = addMockClient(mqttServer);
  await connect(mqttConn2, { clientId: "publisher" });
  await publish(mqttConn2, "offline/q0", 0, { id: 10 });
  await publish(mqttConn2, "offline/q1", 1, { id: 11 });
  await publish(mqttConn2, "offline/q2", 2, { id: 12 });
  await disconnect(mqttConn2);

  // connect again with same clientId as the initial connect,but now with clean = false, just to check
  const mqttConn3 = addMockClient(mqttServer);
  await connect(mqttConn3, { clientId, clean: false });
  // expect no published packet to be delivered while offline
  await ping(mqttConn3);
  await disconnect(mqttConn3);
});

test("V5: Connect V5 works", async () => {
  const { mqttConn } = startMockServer();
  const connack = await connect5(mqttConn, { clientId: "" });
  assert.deepEqual(connack.reasonCode, 0, "Reason code 0 is expected");
  const props = connack.properties;
  const cfg = configuration.context;
  assert.equal(
    props?.maximumQos,
    cfg.maximumQos,
    "Props contain configuration data",
  );
  assert.equal(
    props?.assignedClientIdentifier?.startsWith("Opifex-"),
    true,
    "Client identifier is assigned",
  );

  await disconnect5(mqttConn);
  await mqttConn.next();
  assert.strictEqual(mqttConn.isClosed, true);
});

test("V5: Fails on unsupported protocol level and returns V5 ReasonCode", async () => {
  const { mqttConn } = startMockServer({
    configuration: { context: { protocols: [MQTTLevel.v4] } },
  });

  const connack = await connect5(mqttConn, {
    clientId: "v5Client",
  });
  assert.strictEqual(
    connack.reasonCode,
    ReasonCode.unsupportedProtocolVersion,
  );

  await mqttConn.next();
  assert.strictEqual(mqttConn.isClosed, true);
});

test("Will Packet: Retain not supported returns retainNotSupported", async () => {
  const { mqttConn } = startMockServer({
    configuration: { context: { retainAvailable: false } },
  });

  const connack = await connect(mqttConn, {
    will: {
      topic: "will/topic",
      payload: txtEncoder.encode("payload"),
      qos: 0,
      retain: true,
    },
  });

  assert.strictEqual(
    connack.returnCode,
    AuthenticationResult.serverUnavailable,
  );

  await mqttConn.next();
  assert.strictEqual(mqttConn.isClosed, true);
});

test("V5 Will Packet: unauthorized will topic returns notAuthorized", async () => {
  const { mqttConn } = startMockServer({
    handlers: {
      isAuthorizedToPublish: () => false,
    },
  });

  const connack = await connect5(mqttConn, {
    will: {
      topic: "will/topic",
      payload: txtEncoder.encode("payload"),
      qos: 0,
      retain: false,
    },
  });

  assert.strictEqual(
    connack.reasonCode,
    ReasonCode.notAuthorized,
  );

  await mqttConn.next();
  assert.strictEqual(mqttConn.isClosed, true);
});

test("V5 Will Packet: QoS exceeds maximumQos returns qosNotSupported", async () => {
  const { mqttConn } = startMockServer({
    configuration: { context: { maximumQos: 1 } },
  });

  const connack = await connect5(mqttConn, {
    will: {
      topic: "will/topic",
      payload: txtEncoder.encode("payload"),
      qos: 2, // Exceeds max QoS 1
      retain: false,
    },
  });

  assert.strictEqual(
    connack.reasonCode,
    ReasonCode.qosNotSupported,
  );

  await mqttConn.next();
  assert.strictEqual(mqttConn.isClosed, true);
});

test("V5 Will Packet: willDelayInterval greater than sessionExpiryInterval fails", async () => {
  const { mqttConn } = startMockServer();

  const connack = await connect5(mqttConn, {
    clientId: "v5WillClient",
    properties: {
      sessionExpiryInterval: 100,
    },
    will: {
      topic: "will/topic",
      payload: txtEncoder.encode("payload"),
      qos: 0,
      retain: false,
      properties: {
        willDelayInterval: 200, // Greater than sessionExpiryInterval (100)
      },
    },
  });

  assert.strictEqual(
    connack.reasonCode,
    ReasonCode.payloadFormatInvalid,
  );

  await mqttConn.next();
  assert.strictEqual(mqttConn.isClosed, true);
});

test("V5: sessionExpiryInterval capped to maxSessionExpiryInterval", async () => {
  const { mqttConn } = startMockServer({
    configuration: { context: { maxSessionExpiryInterval: 300 } },
  });
  const connack = await connect5(mqttConn, {
    clientId: "cappedSessionClient",
    clean: false,
    properties: {
      sessionExpiryInterval: 1000, // Greater than maxSessionExpiryInterval (300)
    },
  });

  assert.strictEqual(connack.reasonCode, ReasonCode.success);
  assert.strictEqual(connack.properties?.sessionExpiryInterval, 300);

  await disconnect5(mqttConn);
});

test("V5: Reason string returned in properties when provideReasonStrings is true", async () => {
  const { mqttConn } = startMockServer({
    configuration: {
      context: {
        provideReasonStrings: true,
        protocols: [MQTTLevel.v4],
      },
    },
  });
  const connack = await connect5(mqttConn, {});
  assert.strictEqual(
    connack.reasonCode,
    ReasonCode.unsupportedProtocolVersion,
  );
  assert.strictEqual(
    connack.properties?.reasonString,
    "Protocol version 5 is not supported",
  );

  await mqttConn.next();
  assert.strictEqual(mqttConn.isClosed, true);
});

test("reasonToReturnCode branch coverage for V4 status mappings", async () => {
  const testCases = [
    {
      reasonCode: ReasonCode.clientIdentifierNotValid,
      expectedReturnCode: AuthenticationResult.rejectedUsername,
    },
    {
      reasonCode: ReasonCode.badAuthenticationMethod,
      expectedReturnCode: AuthenticationResult.badUsernameOrPassword,
    },
    {
      reasonCode: ReasonCode.banned,
      expectedReturnCode: AuthenticationResult.notAuthorized,
    },
    {
      reasonCode: ReasonCode.packetIdentifierNotFound, // Unmapped fallback
      expectedReturnCode: AuthenticationResult.serverUnavailable,
    },
  ];

  for (const tc of testCases) {
    const { mqttConn } = startMockServer({
      handlers: {
        isAuthenticated: () => ({ reasonCode: tc.reasonCode }),
      },
    });

    const connack = await connect(mqttConn);
    assert.strictEqual(
      connack.returnCode,
      tc.expectedReturnCode,
      `ReasonCode ${tc.reasonCode} should map to returnCode ${tc.expectedReturnCode}`,
    );

    await mqttConn.next();
    assert.strictEqual(mqttConn.isClosed, true);
  }
});
