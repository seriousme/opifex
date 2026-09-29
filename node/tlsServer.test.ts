import { test } from "node:test";
import assert from "node:assert/strict";
import { TcpClient } from "./tcpClient.ts";
import { TlsServer } from "./tlsServer.ts";
import { logger, LogLevel } from "../utils/mod.ts";
import { generateLocalhostCerts } from "../dev_utils/mod.ts";
import { testClient } from "../dev_utils/testClient.ts";
import { MqttServer } from "../server/mod.ts";

logger.level(LogLevel.info);

const { key, cert, caCert } = generateLocalhostCerts();

test("Test pubSub using client and server", async () => {
  const server = new TlsServer({ port: 0, key, cert }, {});
  server.start();

  assert.deepStrictEqual(
    server.port !== undefined,
    true,
    "server runs a a random port",
  );
  logger.verbose("server running on: ", {
    port: server.port,
    address: server.address,
  });

  const params = {
    url: new URL(`mqtts://${server.address}:${server.port}`),
    numberOfRetries: 0,
    caCerts: [caCert],
  };

  logger.verbose("client parameters: ", params);

  const client = new TcpClient();
  await testClient(client, params);

  logger.verbose("Stop server");
  server.stop();
});

test("Passing a mqttServer works", () => {
  const mqttServer = new MqttServer({});
  const server = new TlsServer({ port: 0, key, cert }, mqttServer);
  assert(server.mqttServer === mqttServer);
});
