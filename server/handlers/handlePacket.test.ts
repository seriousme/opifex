import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnyPacket } from "../deps.ts";
import { MQTTLevel, PacketType } from "../deps.ts";
import { startMockServer } from "../../dev_utils/mod.ts";

test("rejects packets before CONNECT", async () => {
  const { mqttConn } = startMockServer();

  // Try to send PINGREQ before CONNECT
  const pingreqPacket: AnyPacket = {
    type: PacketType.pingreq,
    protocolLevel: MQTTLevel.v4,
  };
  mqttConn.send(pingreqPacket);
  await mqttConn.next();

  // Connection should be closed due to protocol violation
  assert.deepStrictEqual(
    mqttConn.isClosed,
    true,
    "Connection should be closed for packets before CONNECT",
  );
});
