import { test } from "node:test";
import assert from "node:assert/strict";
import { ReasonCode, reasonCodeToString } from "./ReasonCode.ts";
import { PacketType } from "./mod.ts";

test("lookup of reason codes works", () => {
  assert.equal(
    reasonCodeToString(PacketType.connect, ReasonCode.success),
    "Success",
    "Succes on Connect works",
  );
  assert.equal(
    reasonCodeToString(PacketType.suback, ReasonCode.success),
    "Granted QoS 0",
    "Granted QoS 0 on Suback works",
  );
  assert.equal(
    reasonCodeToString(PacketType.disconnect, ReasonCode.success),
    "Normal disconnection",
    "Normal disconnection on Disconnect works",
  );
});
