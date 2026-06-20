import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnyPacket } from "../deps.ts";
import { MQTTLevel, PacketType } from "../deps.ts";
import { connect, disconnect, startMockServer } from "../../dev_utils/mod.ts";

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
  const pingreqPacket: AnyPacket = {
    type: PacketType.pingreq,
    protocolLevel: MQTTLevel.v4,
  };
  mqttConn.send(pingreqPacket);

  const { value: pingres } = await mqttConn.next();
  assert.deepStrictEqual(
    pingres.type,
    PacketType.pingres,
    "Server should still be responsive after handling PUBCOMP",
  );

  await disconnect(mqttConn);
});
