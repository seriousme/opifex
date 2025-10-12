import { exit } from "node:process";
import { importClientClass } from "./utils.ts";

const { TcpClient } = await importClientClass();
const client = new TcpClient();
client.onError = (err) => {
  console.log("client error", err);
  exit(1);
};

await client.connect({
  url: new URL("mqtt://localhost:1883"),
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
for await (const _ of client.messages()) {
  counter++;
}
