// runner.js
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runTest({
  WsClient,
  protocol = "ws",
  hostname = "localhost",
  port = 8080,
  path = "/mqtt",
  logger = console.log,
  assert = (value, message) => {
    if (!value) throw new Error(message);
  },
}) {
  // Ensure path starts with a slash
  const formattedPath = path.startsWith("/") ? path : `/${path}`;
  const params = {
    url: new URL(`${protocol}://${hostname}:${port}${formattedPath}`),
    numberOfRetries: 0,
  };

  logger("Connecting client to", params.url);

  const client = new WsClient();
  client.onConnected = () => logger("Client connected to server");

  await client.connect(params);
  const cId = client.clientId;
  logger("Using clientId", cId);

  const publishSet = [];
  for (let q = 0; q < 3; q++) {
    for (let t = 0; t < 3; t++) {
      publishSet.push({ topic: `${cId}/topic-${t}-with-QoS-${q}`, qos: q });
    }
  }

  const subscriptions = publishSet.map((item) => ({
    topicFilter: item.topic,
    qos: item.qos,
  }));
  await client.subscribe({ subscriptions });

  logger("Start receiving");
  const received = [];
  (async () => {
    for await (const item of client.messages()) {
      logger("- Receiving:", item.topic, ", with QoS:", item.qos);
      received.push(item);
    }
  })();

  for (const item of publishSet) {
    logger("- Publishing:", item.topic, ", with QoS:", item.qos);
    await client.publish({
      topic: item.topic,
      qos: item.qos,
      payload: new Uint8Array([0x01]),
    });
  }

  await delay(100);
  logger("Disconnecting client");
  await client.disconnect();
  logger("Disconnected client");

  logger("Check completeness");
  for (const item of publishSet) {
    const found = received.find(
      (f) => f.topic === item.topic && f.qos === item.qos,
    );
    const label = found ? "Found" : "Not found";
    logger(`- ${label}:`, item.topic, ", with QoS:", item.qos);
    assert(found, `${item.topic} -- ${item.qos}`);
  }
  logger("End of demo");
}
