import { test } from "node:test";
import type { AnyPacket } from "../deps.ts";
import { MQTTLevel, PacketType } from "../deps.ts";
import {
  connect,
  disconnect,
  ping,
  startMockServer,
} from "../../dev_utils/mod.ts";

test("PUBREC for unknown packet ID is handled gracefully", async () => {
  const { mqttConn } = startMockServer();

  await connect(mqttConn);

  // Send PUBREC for non-existent packet ID (no pending outgoing QoS 2 message)
  const pubrecPacket: AnyPacket = {
    type: PacketType.pubrec,
    protocolLevel: MQTTLevel.v4,
    id: 9999,
  };
  mqttConn.send(pubrecPacket);

  // Verify server is still responsive (didn't respond with PUBREL for unknown ID)
  await ping(mqttConn);

  await disconnect(mqttConn);
});
