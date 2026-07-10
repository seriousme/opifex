import { createWebStreamPair } from "./webStreamPair.ts";
import { MqttConn } from "../mqttConn/mqttConn.ts";
import { Context, MqttServer } from "../server/mod.ts";
import { handlers } from "./test-handlers.ts";
import type { IPersistence } from "../persistence/mod.ts";

export function startMockServer(persistence?: IPersistence): {
  mqttConn: MqttConn;
  mqttServer: MqttServer;
} {
  // start with a fresh clientlist
  Context.clientList.clear();
  // create a new MQTT server
  const mqttServer = new MqttServer({ handlers, persistence });
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

export function startMockServer2(persistence?: IPersistence): {
  mqttConn1: MqttConn;
  mqttConn2: MqttConn;
  mqttServer: MqttServer;
} {
  const { mqttConn: mqttConn1, mqttServer } = startMockServer(persistence);
  const mqttConn2 = addMockClient(mqttServer);
  return { mqttConn1, mqttConn2, mqttServer };
}

export function startMockServer3(persistence?: IPersistence): {
  mqttConn1: MqttConn;
  mqttConn2: MqttConn;
  mqttConn3: MqttConn;
  mqttServer: MqttServer;
} {
  const { mqttConn1, mqttConn2, mqttServer } = startMockServer2(persistence);
  const mqttConn3 = addMockClient(mqttServer);
  return { mqttConn1, mqttConn2, mqttConn3, mqttServer };
}
