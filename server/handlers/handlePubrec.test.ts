import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnyPacket } from "../deps.ts";
import { MQTTLevel, PacketType } from "../deps.ts";
import { connect, disconnect, startMockServer } from "../../dev_utils/mod.ts";

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
  const pingreqPacket: AnyPacket = {
    type: PacketType.pingreq,
    protocolLevel: MQTTLevel.v4,
  };
  mqttConn.send(pingreqPacket);

  const { value: pingres } = await mqttConn.next();
  assert.deepStrictEqual(
    pingres.type,
    PacketType.pingres,
    "Server should handle unknown PUBREC gracefully without sending PUBREL",
  );

  await disconnect(mqttConn);
});
