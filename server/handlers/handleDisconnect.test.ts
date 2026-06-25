import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnyPacket } from "../deps.ts";
import { PacketType } from "../deps.ts";
import {
  checkNoPacket,
  connect,
  disconnect,
  startMockServer,
  startMockServer2,
  subscribe,
} from "../../dev_utils/mod.ts";

const txtEncoder = new TextEncoder();

test("DISCONNECT closes connection cleanly", async () => {
  const { mqttConn } = startMockServer();

  // Connect first
  await connect(mqttConn);
  // Send DISCONNECT
  await disconnect(mqttConn);
});

test("DISCONNECT clears will message", async () => {
  const connectWithWill: AnyPacket = {
    type: PacketType.connect,
    protocolName: "MQTT",
    protocolLevel: 4,
    clientId: "testClientWithWill",
    clean: true,
    keepAlive: 0,
    username: "IoTester_1",
    password: txtEncoder.encode("strong_password"),
    will: {
      topic: "will/topic",
      payload: txtEncoder.encode("goodbye"),
      qos: 0,
      retain: false,
    },
  };

  const { mqttConn1, mqttConn2 } = startMockServer2();
  // Connect subscriber to catch any will message
  await connect(mqttConn1);
  await subscribe(mqttConn1, "will/topic", 0);

  // Connect with will message
  mqttConn2.send(connectWithWill);
  const { value: connack2 } = await mqttConn2.next();
  assert.deepStrictEqual(connack2.type, PacketType.connack, "Expected CONNACK");
  await disconnect(mqttConn2);
  // Clean disconnect should clear will (will should not be published)
  await checkNoPacket(mqttConn1);
});
