import { loader } from "./utils.ts";
import { runAsap } from "../dev_utils/timers.ts";

loader((ClientClass) => {
  const client = new ClientClass();

  client.connect({
    url: new URL("mqtt://127.0.0.1:1884"),
  });

  client.onConnected = () => {
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
  };

  client.onError = (err) => {
    console.log("client error", err);
  };
});
