import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnyPacket } from "../deps.ts";
import { MQTTLevel, PacketType } from "../deps.ts";
import { connect, disconnect, startMockServer } from "../../dev_utils/mod.ts";

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
  const pingreqPacket: AnyPacket = {
    type: PacketType.pingreq,
    protocolLevel: MQTTLevel.v4,
  };
  mqttConn.send(pingreqPacket);

  const { value: pingres } = await mqttConn.next();
  assert.deepStrictEqual(
    pingres.type,
    PacketType.pingres,
    "Server should still be responsive after handling PUBACK",
  );

  await disconnect(mqttConn);
});
