import { exit } from "node:process";
import { runAsap } from "../dev_utils/timers.ts";
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

const payload = new TextEncoder().encode("payload");
let sent = 0;
const interval = 5000;

const loop = () => {
  sent++;
  client.publish({ topic: "test", payload })
    .then(() => runAsap(loop));
};

function count() {
  console.log("sent/s", (sent / interval) * 1000);
  sent = 0;
}

setInterval(count, interval);
loop();
