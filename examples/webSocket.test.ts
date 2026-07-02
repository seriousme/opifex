import { test } from "node:test";
import assert from "node:assert/strict";
import { delay, logger, LogLevel } from "@seriousme/opifex/utils";

import type { PublishPacket, QoS } from "@seriousme/opifex/mqttPacket";

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

    const params = {
      url: new URL(`ws://${hostname}:${server.port}`),
      numberOfRetries: 0,
    };

    const client = new WsClient();
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
  }
});
