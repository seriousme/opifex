import { test } from "node:test";
import type { AnyPacket } from "../deps.ts";
import { MQTTLevel, PacketType } from "../deps.ts";
import {
  connect,
  disconnect,
  ping,
  startMockServer,
} from "../../dev_utils/mod.ts";

test("PUBACK is handled without error", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  // Send PUBACK (simulating acknowledgment for outgoing QoS 1 message)
  const pubackPacket: AnyPacket = {
    type: PacketType.puback,
    protocolLevel: MQTTLevel.v4,
    id: 9999,
  };
  mqttConn.send(pubackPacket);

  // Verify server is still responsive
  await ping(mqttConn);

  await disconnect(mqttConn);
});
