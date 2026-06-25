import { test } from "node:test";
import assert from "node:assert/strict";
import { TcpClient } from "./tcpClient.ts";
import { TlsServer } from "./tlsServer.ts";
import { logger, LogLevel } from "../utils/mod.ts";
import type { PublishPacket, QoS } from "../mqttPacket/mod.ts";
import { delay, generateLocalhostCerts } from "../dev_utils/mod.ts";

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

  await client.connect(params);
  assert(true, "Client connected to server");

  const publishSet: { topic: string; qos: QoS }[] = [
    { topic: "t0@q0", qos: 0 },
    { topic: "t1@q0", qos: 0 },
    { topic: "t2@q0", qos: 0 },
    { topic: "t0@q1", qos: 1 },
    { topic: "t1@q1", qos: 1 },
    { topic: "t2@q1", qos: 1 },
    { topic: "t0@q2", qos: 2 },
    { topic: "t1@q2", qos: 2 },
    { topic: "t2@q2", qos: 2 },
  ];

  const subscriptions = publishSet.map((item) => ({
    topicFilter: item.topic,
    qos: item.qos,
  }));
  await client.subscribe({
    subscriptions,
  });

  // the IIFE ensures message reception runs in parallel
  logger.verbose(`Start receiving`);
  const received: PublishPacket[] = [];
  (async () => {
    for await (const item of client.messages()) {
      logger.verbose(`Receiving: ${item.topic} -- ${item.qos}`);
      received.push(item);
    }
  })();
  // end of IIFE
  for (const item of publishSet) {
    logger.verbose(`Publishing: ${item.topic} -- ${item.qos}`);
    await client.publish({
      topic: item.topic,
      qos: item.qos,
      payload: new Uint8Array([0x01]),
    });
  }

  await delay(100);
  logger.verbose(`Disconnect client`);
  await client.disconnect();

  logger.verbose(`Check completeness`);
  for (const item of publishSet) {
    const found = received.find((f) =>
      f.topic == item.topic && f.qos === item.qos
    );
    logger.verbose(`Found: ${item.topic} -- ${item.qos}`);
    assert(found, `${item.topic} -- ${item.qos}`);
  }

  logger.verbose(`Stop server`);
  server.stop();
});
