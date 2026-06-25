import assert from "node:assert/strict";
import { test } from "node:test";
import {
  connect,
  delay,
  disconnect,
  startMockServer,
} from "../dev_utils/mod.ts";

test(
  "Preconnect timer: connection closes if CONNECT not received within 3 seconds",
  { concurrency: false },
  async () => {
    const { mqttConn } = startMockServer();

    // Wait 3.5 seconds without sending CONNECT packet
    await delay(3500);

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
    const { mqttConn } = startMockServer();

    // Wait 2 seconds (before timeout)
    await delay(2000);

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
    const { mqttConn } = startMockServer();

    // Send CONNECT immediately
    await connect(mqttConn, { clientId: "preconnectTestImmediate" });

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
  "Preconnect timer: closes connection at exactly 3 second mark",
  { concurrency: false },
  async () => {
    const { mqttConn } = startMockServer();

    // Wait just under 3 seconds - should still be connected
    await delay(2900);

    // Connection should still be open
    assert.deepStrictEqual(
      mqttConn.isClosed,
      false,
      "Connection should be open at 2.9 seconds",
    );

    // Wait additional 200ms to cross the 3 second boundary
    await delay(200);

    // Try to interact with connection
    await mqttConn.next();

    // Connection should now be closed
    assert.deepStrictEqual(
      mqttConn.isClosed,
      true,
      "Connection should be closed after 3 seconds",
    );
  },
);

test(
  "Preconnect timer: timer does not fire after successful connection",
  { concurrency: false },
  async () => {
    const { mqttConn } = startMockServer();

    // Connect early (at ~2 seconds)
    await delay(2000);
    await connect(mqttConn, { clientId: "preconnectTestNoFire" });

    // Wait additional 1 second (total 3 seconds)
    await delay(1000);

    // Connection should still be open because timer was cleared
    assert.deepStrictEqual(
      mqttConn.isClosed,
      false,
      "Connection should remain open after successful CONNECT despite waiting past 3 seconds total",
    );

    // Cleanup
    await disconnect(mqttConn);
  },
);
