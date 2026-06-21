import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnyPacket } from "../deps.ts";
import { MQTTLevel, PacketType } from "../deps.ts";
import {
  connect,
  delay,
  disconnect,
  ping,
  startMockServer,
} from "../../dev_utils/mod.ts";

const txtEncoder = new TextEncoder();

const publishPacket: AnyPacket = {
  type: PacketType.publish,
  protocolLevel: MQTTLevel.v4,
  topic: "test/topic",
  payload: txtEncoder.encode("test payload"),
  qos: 0,
  retain: false,
  dup: false,
  id: 0,
};

test("MQTT-3.1.2.10: connection stays alive with PINGREQ", {
  concurrency: false,
}, async () => {
  const { mqttConn } = startMockServer();
  const keepAlive = 1; // 1 second -> 1500ms timeout

  // Connect with keepAlive
  await connect(mqttConn, { clientId: "keepaliveTest1", keepAlive });

  // Wait for 750ms (half the timeout period)
  await delay(750);

  // Send PINGREQ to reset timer
  await ping(mqttConn);

  // Wait another 750ms (total 1500ms from start, but timer was reset at 750ms)
  await delay(750);

  // Connection should still be alive
  assert.deepStrictEqual(
    mqttConn.isClosed,
    false,
    "Connection should stay alive after PINGREQ resets timer",
  );

  // Cleanup
  await disconnect(mqttConn);
});

test("MQTT-3.1.2.10: connection closes after 1.5x keepAlive timeout", {
  concurrency: false,
}, async () => {
  const { mqttConn } = startMockServer();
  const keepAlive = 1; // 1 second -> 1500ms timeout

  // Connect with keepAlive
  await connect(mqttConn, { clientId: "keepaliveTest2", keepAlive });

  // Wait for timeout to expire (1500ms + buffer)
  await delay(1600);

  // flush state
  await mqttConn.next();

  // Connection should be closed
  assert.deepStrictEqual(
    mqttConn.isClosed,
    true,
    "Connection should close after keepAlive timeout expires",
  );
});

test(
  "MQTT-3.1.2.10: any packet resets keepAlive timer",
  { concurrency: false },
  async () => {
    const { mqttConn } = startMockServer();
    const keepAlive = 1; // 1 second -> 1500ms timeout

    // Connect with keepAlive
    await connect(mqttConn, { clientId: "keepaliveTest3", keepAlive });

    // Wait for 750ms (half timeout)
    await delay(750);

    // Send PUBLISH packet (not PINGREQ) to reset timer
    mqttConn.send(publishPacket);

    // Wait another 750ms (total 1500ms from start, but timer was reset at 750ms)
    await delay(750);

    // Connection should still be alive
    assert.deepStrictEqual(
      mqttConn.isClosed,
      false,
      "Connection should stay alive - any packet should reset timer",
    );

    // Cleanup
    await disconnect(mqttConn);
  },
);

test(
  "MQTT-3.1.2.10: keepAlive=0 disables timeout",
  { concurrency: false },
  async () => {
    const { mqttConn } = startMockServer();
    const keepAlive = 0; // 0 means no timeout

    // Connect with keepAlive=0
    await connect(mqttConn, { clientId: "keepaliveTest4", keepAlive });

    // Wait longer than any reasonable timeout
    await delay(2000);

    // Connection should still be open
    assert.deepStrictEqual(
      mqttConn.isClosed,
      false,
      "Connection should remain open when keepAlive=0",
    );

    // Cleanup
    await disconnect(mqttConn);
  },
);
