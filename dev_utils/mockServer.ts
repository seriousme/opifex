import { createConnNextPair } from "./webStreamToNext.ts";
import { MqttConn } from "../mqttConn/mqttConn.ts";
import { Context, MqttServer } from "../server/mod.ts";
import { handlers } from "./test-handlers.ts";
import type { MqttServerOptions } from "../server/mod.ts";

export function startMockServer(opts: MqttServerOptions = {}): {
  mqttConn: MqttConn;
  mqttServer: MqttServer;
} {
  const serverOpts = { handlers, ...opts };
  // start with a fresh clientlist
  Context.clientList.clear();

  const mqttServer = new MqttServer(serverOpts);
  const { input, output } = createConnNextPair();
  const mqttConn = new MqttConn({ conn: output });
  mqttServer.serve(input);
  return { mqttConn, mqttServer };
}

export function addMockClient(mqttServer: MqttServer): MqttConn {
  const { input, output } = createConnNextPair();
  const mqttConn = new MqttConn({ conn: output });
  mqttServer.serve(input);
  return mqttConn;
}
