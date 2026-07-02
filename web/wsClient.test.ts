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
