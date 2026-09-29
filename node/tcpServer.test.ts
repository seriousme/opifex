import { test } from "node:test";
import assert from "node:assert/strict";
import { TcpClient } from "./tcpClient.ts";
import { TcpServer } from "./tcpServer.ts";
import { logger, LogLevel } from "../utils/mod.ts";
import { delay } from "../dev_utils/mod.ts";
import type { ProtocolLevel, PublishPacket } from "../mqttPacket/mod.ts";
import { testClient } from "../dev_utils/testClient.ts";
import { MqttServer } from "../server/mod.ts";

logger.level(LogLevel.info);

test("Test pubSub using client and server", async () => {
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
  server.stop();
});

test("Test subscription persistence after reconnect", async () => {
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

  logger.verbose("client parameters: ", params);

  const client = new TcpClient();
  const testTopic = "test/topic";
  const received: PublishPacket[] = [];

  // First connection and subscription
  await client.connect(params);
  await client.subscribe({
    subscriptions: [{
      topicFilter: testTopic,
      qos: 0,
    }],
  });

  // Start receiving messages
  (async () => {
    for await (const item of client.messages()) {
      received.push(item);
    }
  })();

  // Disconnect client
  await client.disconnect();
  await delay(100);

  // Reconnect client
  await client.connect(params);
  await delay(100);

  // Publish test message
  await client.publish({
    topic: testTopic,
    qos: 0,
    payload: new Uint8Array([0x01]),
  });

  await delay(100);
  logger.verbose("Disconnect client");
  await client.disconnect();

  // Verify message was received
  assert.equal(received.length, 1, "Should receive one message");
  assert.equal(
    received[0].topic,
    testTopic,
    "Should receive message on subscribed topic",
  );

  server.stop();
});

test("Passing a mqttServer works", () => {
  const mqttServer = new MqttServer({});
  const server = new TcpServer({ port: 0 }, mqttServer);
  assert(server.mqttServer === mqttServer);
});
