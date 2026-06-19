import { createWebStreamPair } from "./webStreamPair.ts";
import { MqttConn } from "@seriousme/opifex/mqttConn";
import { MqttServer } from "@seriousme/opifex/server";
import { handlers } from "./test-handlers.ts";

export function startMockServer(): {
  mqttConn: MqttConn;
} {
  const mqttServer = new MqttServer({ handlers });
  const { input, output } = createWebStreamPair();
  const mqttConn = new MqttConn({ conn: output });
  mqttServer.serve(input);
  return { mqttConn };
}
