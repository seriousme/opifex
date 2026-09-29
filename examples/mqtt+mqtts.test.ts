import { test } from "node:test";
import assert from "node:assert/strict";
import { TcpClient } from "@seriousme/opifex/tcpClient";
import { TlsServer } from "@seriousme/opifex/tlsServer";
import { MqttServer } from "@seriousme/opifex/server";
import { delay, logger, LogLevel } from "@seriousme/opifex/utils";
import type { PublishPacket, QoS } from "@seriousme/opifex/mqttPacket";
import { generateLocalhostCerts } from "../dev_utils/generateCert.ts";
import { TcpServer } from "@seriousme/opifex/tcpServer";

logger.level(LogLevel.info);

test("Test pubSub using TLS client and a TCP client", async function () {
  // the localhost certs generate here are great for testing but lack securiity
  // use something like LetsEncrypt for any serious server
  // generateLocalhostCerts is a dev tool and relies on node-forge as a (dev)dependency
  const { key, cert, caCert } = generateLocalhostCerts();
  // first create the mqttServer, so we can pass it to multiple protocol servers
  const mqttServer = new MqttServer({});

  const tlsServer = new TlsServer({ port: 0, key, cert }, mqttServer);
  const tcpServer = new TcpServer({ port: 0 }, mqttServer);
  // .start() combines instance creation and async initialization
  tlsServer.start();
  tcpServer.start();

  logger.info(
    `TLS server running on port: ${tlsServer.port}, address: ${tlsServer.address}`,
  );
  logger.info(
    `TCP server running on port: ${tcpServer.port}, address: ${tcpServer.address}`,
  );
  // pick the correct hostname
  const tlsHostname = tlsServer.address === "0.0.0.0"
    ? "127.0.0.1"
    : tlsServer.address;
  const tcpHostname = tcpServer.address === "0.0.0.0"
    ? "127.0.0.1"
    : tcpServer.address;

  const tlsParams = {
    url: new URL(`mqtts://${tlsHostname}:${tlsServer.port}`),
    clientId: "I am a TLS client",
    numberOfRetries: 0,
    // since we signed our server cert ourselves we need to add the caCert
    // this is not required if you use a public Certificate Authority
    caCerts: [caCert],
  };

  const tcpParams = {
    url: new URL(`mqtt://${tcpHostname}:${tcpServer.port}`),
    clientId: "I am a TCP client",
    numberOfRetries: 0,
  };

  const tlsClient = new TcpClient(); // TcpClient can also handle TLS
  const tcpClient = new TcpClient();
  await tlsClient.connect(tlsParams);
  await tcpClient.connect(tcpParams);
  logger.info("tlsClient connected to server at", tlsClient.url.toString());
  logger.info("tcpClient connected to server at", tcpClient.url.toString());

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
  await tcpClient.subscribe({
    subscriptions,
  });

  // the IIFE ensures message reception runs in parallel
  logger.info("TCP client Start receiving");
  const received: PublishPacket[] = [];
  (async function () {
    for await (const item of tcpClient.messages()) {
      logger.verbose("Receiving:", item.topic, "--", item.qos);
      received.push(item);
    }
  })();
  // end of IIFE
  logger.info("TLS client Start publishing");
  for (const item of publishSet) {
    logger.verbose("Publishing:", item.topic, "--", item.qos);
    await tlsClient.publish({
      topic: item.topic,
      qos: item.qos,
      payload: new Uint8Array([0x01]),
    });
  }

  await delay(100);
  logger.info("Disconnect TLS client");
  await tlsClient.disconnect();
  logger.info("Disconnect TCP client");
  await tcpClient.disconnect();
  logger.info("Check completeness");
  for (const item of publishSet) {
    const found = received.find((f) =>
      f.topic == item.topic && f.qos === item.qos
    );
    logger.verbose("Found:", item.topic, "--", item.qos);
    assert(found, `${item.topic} -- ${item.qos}`);
  }

  // just for demo, you can keep the MQTT server alive on the TCP server wile the TLSserver closes
  logger.info("Stop TLS server");
  await tlsServer.stop();
  logger.info("Stop TCP server");
  await tcpServer.stop();
});
