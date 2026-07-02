import { test } from "node:test";
import assert from "node:assert/strict";
import { TcpClient } from "@seriousme/opifex/tcpClient";
import { TlsServer } from "@seriousme/opifex/tlsServer";
import { SqlitePersistence } from "@seriousme/opifex/persistence";
import { delay, logger, LogLevel } from "@seriousme/opifex/utils";
import type { PublishPacket, QoS } from "@seriousme/opifex/mqttPacket";
import { generateLocalhostCerts } from "../dev_utils/generateCert.ts";

logger.level(LogLevel.info);

test("Test pubSub using TLS client and server and sqlitePersistence", async function () {
  // the localhost certs generate here are great for testing but lack securiity
  // use something like LetsEncrypt for any serious server
  // generateLocalhostCerts is a dev tool and relies on node-forge as a (dev)dependency
  const { key, cert, caCert } = generateLocalhostCerts();
  const dbFile = ":memory:";
  const persistence = new SqlitePersistence(dbFile);
  const server = new TlsServer({ port: 0, key, cert }, { persistence });
  server.start();

  assert.deepStrictEqual(
    server.port !== undefined,
    true,
    "TLS server runs on a random port",
  );
  logger.info(
    `TLS server running on port: ${server.port}, address: ${server.address}`,
  );
  // pick the correct hostname
  const hostname = server.address === "0.0.0.0" ? "127.0.0.1" : server.address;

  const params = {
    url: new URL(`mqtts://${hostname}:${server.port}`),
    numberOfRetries: 0,
    // since we signed our server cert ourselves we need to add the caCert
    // this is not required if you use a public Certificate Authority
    caCerts: [caCert],
  };

  const client = new TcpClient();
  await client.connect(params);
  logger.info(`Client connected to server at ${client.url}`);

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
  logger.info(`Start receiving`);
  const received: PublishPacket[] = [];
  (async function () {
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
  logger.info(`Disconnect client`);
  await client.disconnect();

  logger.info(`Check completeness`);
  for (const item of publishSet) {
    const found = received.find((f) =>
      f.topic == item.topic && f.qos === item.qos
    );
    logger.verbose(`Found: ${item.topic} -- ${item.qos}`);
    assert(found, `${item.topic} -- ${item.qos}`);
  }

  logger.info(`Stop server`);
  server.stop();
});
