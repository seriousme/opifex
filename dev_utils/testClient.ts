import assert from "node:assert/strict";
import { delay, logger } from "../utils/mod.ts";
import type { PublishPacket, QoS } from "../mqttPacket/mod.ts";
import type { Client, ConnectParameters } from "../client/client.ts";

export async function testClient(client: Client, params: ConnectParameters) {
  logger.verbose("client parameters: ", params);
  client.onConnected = () => logger.verbose("Client connected to server");

  await client.connect(params);

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
  logger.verbose("Start receiving");
  const received: PublishPacket[] = [];
  (async () => {
    for await (const item of client.messages()) {
      logger.verbose("Receiving:", item.topic, "--", item.qos);
      received.push(item);
    }
  })();
  // end of IIFE
  for (const item of publishSet) {
    logger.verbose("Publishing:", item.topic, "--", item.qos);
    await client.publish({
      topic: item.topic,
      qos: item.qos,
      payload: new Uint8Array([0x01]),
    });
  }

  await delay(100);
  logger.verbose("Disconnect client");
  await client.disconnect();

  logger.verbose("Check completeness");
  for (const item of publishSet) {
    const found = received.find((f) =>
      f.topic == item.topic && f.qos === item.qos
    );
    logger.verbose("Found:", item.topic, "--", item.qos);
    assert(found, `${item.topic} -- ${item.qos}`);
  }
}
