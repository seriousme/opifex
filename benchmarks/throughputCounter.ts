import { loader } from "./utils.ts";

loader(async (ClientClass) => {
  const client = new ClientClass();

  await client.connect({
    url: new URL("mqtt://127.0.0.1:1884"),
  });

  await client.subscribe({ subscriptions: [{ topicFilter: "test", qos: 0 }] });

  let counter = 0;
  const interval = 5000;

  function count() {
    console.log("received/s", (counter / interval) * 1000);
    counter = 0;
  }

  setInterval(count, interval);

  // // Consume using a callback
  // client.onPacket = async (packet) => {
  //   counter++;
  // };

  // Consume using an AsyncIterator
  for await (const message of client.messages()) {
    counter++;
  }
});
