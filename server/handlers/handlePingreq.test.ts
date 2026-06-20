import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnyPacket } from "../deps.ts";
import { MQTTLevel, PacketType } from "../deps.ts";
import { connect, disconnect, startMockServer } from "../../dev_utils/mod.ts";

const pingreqPacket: AnyPacket = {
  type: PacketType.pingreq,
  protocolLevel: MQTTLevel.v4,
};

test("PINGREQ returns PINGRES", async () => {
  const { mqttConn } = startMockServer();

  // Connect first
  await connect(mqttConn);

  // Send PINGREQ
  mqttConn.send(pingreqPacket);
  const { value: pingres } = await mqttConn.next();
  assert.deepStrictEqual(
    pingres.type,
    PacketType.pingres,
    "Expected PINGRES response to PINGREQ",
  );

  // Disconnect
  await disconnect(mqttConn);
});
