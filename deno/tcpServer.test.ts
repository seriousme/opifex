import { test } from "node:test";
import assert from "node:assert/strict";
import { TcpClient } from "./tcpClient.ts";
import { TcpServer } from "./tcpServer.ts";
import { logger, LogLevel } from "../utils/mod.ts";
import type { ProtocolLevel } from "../mqttPacket/mod.ts";
import { testClient } from "../dev_utils/testClient.ts";
import { MqttServer } from "../server/mod.ts";

logger.level(LogLevel.info);

test("Deno: Test pubSub using client and server", async () => {
  const server = new TcpServer({ port: 0 }, {});
  server.start();

  assert.deepStrictEqual(
    server.port !== undefined,
    true,
    "server runs a a random port",
  );
  logger.verbose({ port: server.port, address: server.address });

  const params = {
    url: new URL(`mqtt://${server.address}:${server.port}`),
    numberOfRetries: 0,
  };

  const client = new TcpClient();
  await testClient(client, params);

  logger.verbose("Stop server");
  await server.stop();
});

test("Deno: Test subscription persistence after reconnect", async () => {
  // Start server
  const server = new TcpServer({ port: 0 }, {});
  server.start();

  const params = {
    url: new URL(`mqtt://${server.address}:${server.port}`),
    numberOfRetries: 0,
    options: {
      protocolLevel: 4 as ProtocolLevel,
      clean: false,
    },
  };

  const client = new TcpClient();
  await testClient(client, params);

  logger.verbose("Stop server");
  await server.stop();
});

test("Deno: Passing a mqttServer works", () => {
  const mqttServer = new MqttServer({});
  const server = new TcpServer({ port: 0 }, mqttServer);
  assert(server.mqttServer === mqttServer);
});
