import { test } from "node:test";
import type { AnyPacket } from "../deps.ts";
import { MQTTLevel, PacketType } from "../deps.ts";
import {
  connect,
  disconnect,
  ping,
  startMockServer,
} from "../../dev_utils/mod.ts";

test("PUBCOMP is handled without error", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  // Send PUBCOMP (simulating final step of QoS 2 outgoing flow)
  const pubcompPacket: AnyPacket = {
    type: PacketType.pubcomp,
    protocolLevel: MQTTLevel.v4,
    id: 9999,
  };
  mqttConn.send(pubcompPacket);

  // Verify server is still responsive
  await ping(mqttConn);

  await disconnect(mqttConn);
});
