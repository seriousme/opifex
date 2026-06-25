import { createWebStreamPair } from "./webStreamPair.ts";
import { MqttConn } from "@seriousme/opifex/mqttConn";
import { Context, MqttServer } from "@seriousme/opifex/server";
import { handlers } from "./test-handlers.ts";

export function startMockServer(): {
  mqttConn: MqttConn;
  mqttServer: MqttServer;
} {
  // start with a fresh clientlist
  Context.clientList.clear();
  // create a new MQTT server
  const mqttServer = new MqttServer({ handlers });
  const { input, output } = createWebStreamPair();
  const mqttConn = new MqttConn({ conn: output });
  mqttServer.serve(input);
  return { mqttConn, mqttServer };
}

export function startMockServer2(): {
  mqttConn1: MqttConn;
  mqttConn2: MqttConn;
  mqttServer: MqttServer;
} {
  const mqttServer = new MqttServer({ handlers });
  const { input: input1, output: output1 } = createWebStreamPair();
  const { input: input2, output: output2 } = createWebStreamPair();
  const mqttConn1 = new MqttConn({ conn: output1 });
  const mqttConn2 = new MqttConn({ conn: output2 });
  mqttServer.serve(input1);
  mqttServer.serve(input2);
  return { mqttConn1, mqttConn2, mqttServer };
}
