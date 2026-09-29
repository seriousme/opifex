import { test } from "node:test";
import assert from "node:assert/strict";
import { logger, LogLevel } from "@seriousme/opifex/utils";
import { runTest } from "./public/testRunner.js";

logger.level(LogLevel.info);

test("Deno: Test pubSub using WebSocket client and server and memoryPersistence", async function () {
  // Nodejs does not natively support WebSockets so we only import Websocket client and server here
  if (typeof Deno !== "undefined") {
    const { WsClient } = await import("@seriousme/opifex/wsClient");
    const { WsServer } = await import("@seriousme/opifex/wsServer");
    const server = new WsServer({ port: 0 }, {});
    server.start();

    assert.deepStrictEqual(
      server.port !== undefined,
      true,
      "WebSocket server runs on a random port",
    );
    logger.info(
      `WebSocket server running on port: ${server.port}, address: ${server.address}`,
    );
    // pick the correct hostname
    const hostname = server.address === "0.0.0.0"
      ? "127.0.0.1"
      : server.address;

    await runTest({
      WsClient,
      protocol: "ws",
      hostname,
      port: server.port,
      logger: logger.verbose,
      assert,
    });
    logger.info("Stop server");
    await server.stop();
  }
});
