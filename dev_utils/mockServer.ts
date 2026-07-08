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

export function addMockClient(mqttServer: MqttServer): MqttConn {
  const { input, output } = createWebStreamPair();
  const mqttConn = new MqttConn({ conn: output });
  mqttServer.serve(input);
  return mqttConn;
}

export function startMockServer2(): {
  mqttConn1: MqttConn;
  mqttConn2: MqttConn;
  mqttServer: MqttServer;
} {
  const { mqttConn: mqttConn1, mqttServer } = startMockServer();
  const mqttConn2 = addMockClient(mqttServer);
  return { mqttConn1, mqttConn2, mqttServer };
}

export function startMockServer3(): {
  mqttConn1: MqttConn;
  mqttConn2: MqttConn;
  mqttConn3: MqttConn;
  mqttServer: MqttServer;
} {
  const { mqttConn1, mqttConn2, mqttServer } = startMockServer2();
  const mqttConn3 = addMockClient(mqttServer);
  return { mqttConn1, mqttConn2, mqttConn3, mqttServer };
}
