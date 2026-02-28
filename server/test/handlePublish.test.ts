import assert from "node:assert/strict";
import { test } from "node:test";
import { createWebSocketPair, resolveNextTick } from "../../dev_utils/mod.ts";
import { type AnyPacket, MQTTLevel, PacketType } from "../../mqttPacket/mod.ts";
import { logger, LogLevel, MqttConn } from "../deps.ts";
import { MqttServer } from "../mod.ts";
import { handlers } from "./test-handlers.ts";

const txtEncoder = new TextEncoder();
logger.level(LogLevel.debug);

const connectPacket: AnyPacket = {
  type: PacketType.connect,
  protocolName: "MQTT",
  protocolLevel: 4,
  clientId: "testClient",
  clean: true,
  keepAlive: 0,
  username: "IoTester_1",
  password: txtEncoder.encode("strong_password"),
  will: undefined,
};

const disconnectPacket: AnyPacket = {
  type: PacketType.disconnect,
  protocolLevel: MQTTLevel.v4,
};

function startServer(): {
  mqttConn: MqttConn;
  stopServer: () => Promise<void>;
} {
  const { input, output } = createWebSocketPair();
  const mqttConn = new MqttConn({ conn: output });
  input.close = () => {
    mqttConn.close();
  };
  const mqttServer = new MqttServer({ handlers });
  const serverDone = mqttServer.serve(input);
  async function waitForDone(): Promise<void> {
    mqttServer.stop();
    await serverDone;
  }
  return { mqttConn, stopServer: waitForDone };
}

test("Publish with QoS 0 succeeds", async () => {
  const { mqttConn, stopServer } = startServer();
  connectPacket.clientId = "testClientQoS0";  
  mqttConn.send(connectPacket);
  const { value: connack } = await mqttConn.next();
  assert.deepStrictEqual(connack.type, PacketType.connack);

  const publishPacket: AnyPacket = {
    type: PacketType.publish,
    protocolLevel: 4,
    topic: "test/topic",
    payload: txtEncoder.encode("Hello QoS 0"),
    qos: 0,
    retain: false,
  };

  mqttConn.send(publishPacket);
  await resolveNextTick();
  assert.deepStrictEqual(mqttConn.isClosed, false);
  mqttConn.send(disconnectPacket);
  await resolveNextTick();
  assert.deepStrictEqual(mqttConn.isClosed, true);
  await stopServer();
});

test("Publish with QoS 1 receives PUBACK", async () => {
  const { mqttConn, stopServer } = startServer();
  connectPacket.clientId = "testClientQoS1";  
  mqttConn.send(connectPacket);
  const { value: connack } = await mqttConn.next();
  assert.deepStrictEqual(connack.type, PacketType.connack);

  const publishPacket: AnyPacket = {
    type: PacketType.publish,
    protocolLevel: 4,
    topic: "test/topic",
    payload: txtEncoder.encode("Hello QoS 1"),
    qos: 1,
    id: 3,
    retain: false,
  };

  mqttConn.send(publishPacket);
  const { value: puback } = await mqttConn.next();
  assert.deepStrictEqual(puback.type, PacketType.puback, "Expected PUBACK");
  assert.deepStrictEqual(puback.id, 3, "Expected PUBACK with id 3");
  await resolveNextTick();
  assert.deepStrictEqual(mqttConn.isClosed, false, "Connection should remain open after PUBACK");
  logger.debug("Received PUBACK, connection is still open as expected");
  mqttConn.send(disconnectPacket);
  logger.debug("Sent DISCONNECT packet");
  await resolveNextTick();
  assert.deepStrictEqual(mqttConn.isClosed, true, "Connection should be closed after DISCONNECT");
   await stopServer();
});

test("Publish with QoS 2 receives PUBREC", { skip: true }, async () => {
  const { mqttConn } = startServer();
  mqttConn.send(connectPacket);
  const { value: connack } = await mqttConn.next();
  assert.deepStrictEqual(connack.type, PacketType.connack);

  const publishPacket: AnyPacket = {
    type: PacketType.publish,
    protocolLevel: 4,
    topic: "test/topic",
    payload: txtEncoder.encode("Hello QoS 2"),
    qos: 2,
    id: 2,
    retain: false,
  };

  mqttConn.send(publishPacket);
  const { value: pubrec } = await mqttConn.next();
  assert.deepStrictEqual(pubrec.type, PacketType.pubrec, "Expected PUBREC");
  assert.deepStrictEqual(pubrec.id, 2, "Expected PUBREC with id 2");
  await resolveNextTick();
  assert.deepStrictEqual(mqttConn.isClosed, false);
  mqttConn.send(disconnectPacket);
  await resolveNextTick();
  assert.deepStrictEqual(mqttConn.isClosed, true);
});

test("Publish to system topic is rejected", { skip: true }, async () => {
  const { mqttConn } = startServer();
  mqttConn.send(connectPacket);
  const { value: connack } = await mqttConn.next();
  assert.deepStrictEqual(connack.type, PacketType.connack);

  const publishPacket: AnyPacket = {
    type: PacketType.publish,
    protocolLevel: 4,
    topic: "$SYS/test/topic",
    payload: txtEncoder.encode("This should be rejected"),
    qos: 0,
    retain: false,
  };

  mqttConn.send(publishPacket);
  await resolveNextTick();

  // No response expected for rejected QoS 0 message
  // Send disconnect and verify connection closes normally
  mqttConn.send(disconnectPacket);
  await resolveNextTick();
  assert.deepStrictEqual(mqttConn.isClosed, true);
});

test("Publish with QoS 1 to system topic is rejected without PUBACK", {
  skip: true,
}, async () => {
  const { mqttConn } = startServer();
  mqttConn.send(connectPacket);
  const { value: connack } = await mqttConn.next();
  assert.deepStrictEqual(connack.type, PacketType.connack);

  const publishPacket: AnyPacket = {
    type: PacketType.publish,
    protocolLevel: 4,
    topic: "$SYS/test/topic",
    payload: txtEncoder.encode("This should be rejected"),
    qos: 1,
    id: 3,
    retain: false,
  };

  mqttConn.send(publishPacket);
  await resolveNextTick();

  // No PUBACK response expected for rejected message
  mqttConn.send(disconnectPacket);
  await resolveNextTick();
  assert.deepStrictEqual(mqttConn.isClosed, true);
});

test(
  "Multiple QoS 1 publishes are acknowledged correctly",
  { skip: true },
  async () => {
    const { mqttConn } = startServer();
    mqttConn.send(connectPacket);
    const { value: connack } = await mqttConn.next();
    assert.deepStrictEqual(connack.type, PacketType.connack);

    for (let i = 1; i <= 3; i++) {
      const publishPacket: AnyPacket = {
        type: PacketType.publish,
        protocolLevel: 4,
        topic: "test/topic",
        payload: txtEncoder.encode(`Message ${i}`),
        qos: 1,
        id: i,
        retain: false,
      };

      mqttConn.send(publishPacket);
      const { value: puback } = await mqttConn.next();
      assert.deepStrictEqual(puback.type, PacketType.puback);
      assert.deepStrictEqual(puback.id, i);
    }

    mqttConn.send(disconnectPacket);
    await resolveNextTick();
    assert.deepStrictEqual(mqttConn.isClosed, true);
  },
);
