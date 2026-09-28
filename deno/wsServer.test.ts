import { test } from "node:test";
import assert from "node:assert/strict";
import { WsClient } from "../web/wsClient.ts";
import { WsServer } from "./wsServer.ts";
import { logger, LogLevel } from "../utils/mod.ts";
import { testClient } from "../dev_utils/testClient.ts";
import { MqttServer } from "../server/mod.ts";

logger.level(LogLevel.info);

test("Deno: Test pubSub using client and server over webSockets", async () => {
  const server = new WsServer(
    { hostname: "localhost", port: 0 },
    {},
  );
  server.start();

  assert.deepStrictEqual(
    server.port !== undefined,
    true,
    "Http server runs a a random port",
  );
  logger.verbose("server running on: ", {
    port: server.port,
    address: server.address,
  });

  const params = {
    url: new URL(`ws://localhost:${server.port}/mqtt`),
    numberOfRetries: 0,
  };

  const client = new WsClient();
  await testClient(client, params);

  logger.verbose("Stop server");
  server.stop();
});

test("Deno: Passing a mqttServer works", () => {
  const mqttServer = new MqttServer({});
  const server = new WsServer(
    { hostname: "localhost", port: 0 },
    mqttServer,
  );
  assert(server instanceof WsServer);
});
