import assert from "node:assert/strict";
import { test } from "node:test";
import { handleDisconnect } from "./handleDisconnect.ts";
import { PacketType, ReasonCode, ReasonCodeByNumber } from "../deps.ts";
import type { DisconnectPacket } from "../deps.ts";

function createMockContext() {
  return {
    close: () => {},
  };
}

test("handleDisconnect processes V5 rejection", () => {
  const ctx = createMockContext();
  const reasonCode = ReasonCode.notAuthorized;
  assert.throws(() =>
    handleDisconnect(ctx as never, {
      type: PacketType.disconnect,
      protocolLevel: 5,
      reasonCode,
    } as DisconnectPacket), Error(ReasonCodeByNumber[reasonCode]));
});
