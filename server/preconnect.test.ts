import assert from "node:assert/strict";
import { test } from "node:test";
import {
  connect,
  delay,
  disconnect,
  startMockServer,
} from "../dev_utils/mod.ts";
import type { AnyPacket } from "./deps.ts";
import { MQTTLevel } from "./deps.ts";
import { PacketType } from "../mqttPacket/mod.ts";

test(
  "Preconnect timer: connection closes if CONNECT not received within timeout",
  { concurrency: false },
  async () => {
    const { mqttConn } = startMockServer({
      configuration: { context: { preconnectTimeoutMs: 500 } },
    });

    // Wait 750 ms without sending CONNECT packet
    await delay(750);

    // Try to get next packet (should timeout/close)
    await mqttConn.next();

    // Connection should be closed
    assert.deepStrictEqual(
      mqttConn.isClosed,
      true,
      "Connection should be closed after preconnect timeout",
    );
  },
);

test(
  "Preconnect timer: connection succeeds if CONNECT received before timeout",
  { concurrency: false },
  async () => {
    const { mqttConn } = startMockServer({
      configuration: { context: { preconnectTimeoutMs: 500 } },
    });

    // Wait 200 ms (before timeout)
    await delay(200);

    // Send CONNECT packet
    await connect(mqttConn, { clientId: "preconnectTestClient" });

    // Connection should still be open
    assert.deepStrictEqual(
      mqttConn.isClosed,
      false,
      "Connection should remain open after successful CONNECT",
    );

    // Cleanup
    await disconnect(mqttConn);
  },
);

test(
  "Preconnect timer: connection succeeds with immediate CONNECT",
  { concurrency: false },
  async () => {
    const { mqttConn } = startMockServer({
      configuration: { context: { preconnectTimeoutMs: 500 } },
    });

    // Send CONNECT immediately
    await connect(mqttConn, { clientId: "preconnectTestImmediate" });
    await delay(750);

    // Connection should be open
    assert.deepStrictEqual(
      mqttConn.isClosed,
      false,
      "Connection should remain open after immediate CONNECT",
    );

    // Cleanup
    await disconnect(mqttConn);
  },
);

test(
  "Preconnect timer: closes connection at exact time",
  { concurrency: false },
  async () => {
    const { mqttConn } = startMockServer({
      configuration: { context: { preconnectTimeoutMs: 500 } },
    });

    // Wait just under 500 ms - should still be connected
    await delay(400);

    // Connection should still be open
    assert.deepStrictEqual(
      mqttConn.isClosed,
      false,
      "Connection should be open at 2.9 seconds",
    );

    // Wait additional 200ms to cross the 500 ms boundary
    await delay(200);

    // Try to interact with connection
    await mqttConn.next();

    // Connection should now be closed
    assert.deepStrictEqual(
      mqttConn.isClosed,
      true,
      "Connection should be closed now",
    );
  },
);

test("Preconnect handler: handler disconnects session", async () => {
  const txtEncoder = new TextEncoder();

  const connectPacket: AnyPacket = {
    type: PacketType.connect,
    protocolName: "MQTT",
    protocolLevel: MQTTLevel.v4,
    clientId: "testClient",
    clean: true,
    keepAlive: 0,
    username: "IoTester_1",
    password: txtEncoder.encode("strong_password"),
    will: undefined,
  };

  const { mqttConn } = startMockServer({
    handlers: {
      preconnect: () => false,
    },
  });
  await mqttConn.send(connectPacket);
  const { value } = await mqttConn.next();
  assert.deepStrictEqual(
    value,
    undefined,
    "No connack received",
  );
  assert.deepStrictEqual(
    mqttConn.isClosed,
    true,
    "Connection should be closed by the preconnect handler",
  );
});
