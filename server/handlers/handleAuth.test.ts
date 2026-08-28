import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnyPacket } from "../deps.ts";
import { MQTTLevel, PacketType } from "../deps.ts";
import { connect5, startMockServer } from "../../dev_utils/mod.ts";

const authPacket: AnyPacket = {
  type: PacketType.auth,
  protocolLevel: MQTTLevel.v5,
};

test("Auth packet with no handler, closes connection", async () => {
  const { mqttConn } = startMockServer();

  // Connect first
  await connect5(mqttConn);

  // Send PINGREQ
  mqttConn.send(authPacket);
  await mqttConn.next();

  assert.strictEqual(mqttConn.isClosed, true);
});
