import { test } from "node:test";
import assert from "node:assert/strict";
import { WsClient } from "./wsClient.ts";

// most client testing is already done in wsServer.test.ts
test("Web: Test createConn - unsupported protocol", async () => {
  const client = new WsClient();

  // Use an unsupported protocol like 'ftp://' to trigger the throw in createConn
  const invalidParams = {
    url: new URL("ftp://localhost:1883"),
    numberOfRetries: 0,
  };

  // Assert that connect rejects with the specific "Unsupported protocol" error
  await assert.rejects(
    async () => {
      await client.connect(invalidParams);
    },
    {
      name: "Error",
      message: "Unsupported protocol: ftp:",
    },
    "Should throw an error when an unsupported protocol is provided",
  );
});

test("Web: Test createConn - unsupported host", async () => {
  const client = new WsClient();

  // Use an host protocol to trigger the ws error
  const invalidParams = {
    url: new URL("ws://localhost1883"),
    numberOfRetries: 0,
  };

  // Assert that connect rejects with the specific error
  await assert.rejects(
    async () => {
      await client.connect(invalidParams);
    },
    {
      name: "Error",
      message: /^Failed to connect to WebSocket at ws:\/\/localhost1883:80\//,
    },
    "Should throw an error when an unreachable host is provided",
  );
});
