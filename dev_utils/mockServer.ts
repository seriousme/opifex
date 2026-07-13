import { createWebStreamPair } from "./webStreamPair.ts";
import { MqttConn } from "../mqttConn/mqttConn.ts";
import { Context, MqttServer } from "../server/mod.ts";
import { handlers } from "./test-handlers.ts";
import type { MqttServerOptions } from "../server/mod.ts";

export function startMockServer(serverOpts: MqttServerOptions = { handlers }): {
  mqttConn: MqttConn;
  mqttServer: MqttServer;
} {
  // start with a fresh clientlist
  Context.clientList.clear();
  // create a new MQTT server

  const mqttServer = new MqttServer(serverOpts);
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
