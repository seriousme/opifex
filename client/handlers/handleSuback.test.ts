import assert from "node:assert/strict";
import { test } from "node:test";
import { handleSuback } from "./handleSuback.ts";
import { PacketType } from "../deps.ts";
import type { SubackPacket } from "../deps.ts";

function createMockContext() {
  const receivedSubacks: Array<{ id: number; returnCodes: number[] }> = [];
  return {
    protocolLevel: 4 as const,
    store: {
      pendingOutgoing: new Map<number, unknown>(),
      pendingIncoming: new Map(),
      pendingAckOutgoing: new Map(),
    },
    receiveSuback: (id: number, returnCodes: number[]) => {
      receivedSubacks.push({ id, returnCodes });
      return true;
    },
    receivedSubacks,
  };
}

test("handleSuback removes from pending and notifies context", () => {
  const ctx = createMockContext();
  ctx.store.pendingOutgoing.set(1, { type: PacketType.subscribe, id: 1 });

  const packet = {
    type: PacketType.suback,
    protocolLevel: 4 as const,
    id: 1,
    returnCodes: [0],
  } as SubackPacket;

  handleSuback(ctx as never, packet);

  assert.deepStrictEqual(
    ctx.store.pendingOutgoing.has(1),
    false,
    "Should remove from pending",
  );
  assert.deepStrictEqual(
    ctx.receivedSubacks.length,
    1,
    "Should notify context",
  );
  assert.deepStrictEqual(
    ctx.receivedSubacks[0].id,
    1,
    "Should have correct ID",
  );
  assert.deepStrictEqual(
    ctx.receivedSubacks[0].returnCodes,
    [0],
    "Should pass return codes",
  );
});

test("handleSuback handles multiple return codes", () => {
  const ctx = createMockContext();
  ctx.store.pendingOutgoing.set(2, { type: PacketType.subscribe, id: 2 });

  const packet = {
    type: PacketType.suback,
    protocolLevel: 4 as const,
    id: 2,
    returnCodes: [0, 1, 2],
  } as SubackPacket;

  handleSuback(ctx as never, packet);

  assert.deepStrictEqual(
    ctx.receivedSubacks[0].returnCodes,
    [0, 1, 2],
  );
});

test("handleSuback handles subscription failure code", () => {
  const ctx = createMockContext();
  ctx.store.pendingOutgoing.set(3, { type: PacketType.subscribe, id: 3 });

  const SUBSCRIPTION_FAILURE = 0x80;
  const packet = {
    type: PacketType.suback,
    protocolLevel: 4 as const,
    id: 3,
    returnCodes: [0, SUBSCRIPTION_FAILURE],
  } as SubackPacket;

  handleSuback(ctx as never, packet);

  assert.deepStrictEqual(
    ctx.receivedSubacks[0].returnCodes,
    [0, SUBSCRIPTION_FAILURE],
  );
});

test("handleSuback handles notification for MQTT v5", () => {
  const ctx = createMockContext();
  ctx.store.pendingOutgoing.set(4, { type: PacketType.subscribe, id: 4 });

  const packet = {
    type: PacketType.suback,
    protocolLevel: 5 as const,
    id: 4,
    reasonCodes: [0],
  } as SubackPacket;

  handleSuback(ctx as never, packet);

  assert.deepStrictEqual(
    ctx.store.pendingOutgoing.has(4),
    false,
    "Should remove from pending",
  );

  assert.deepStrictEqual(
    ctx.receivedSubacks.length,
    1,
    "Should notify for v5",
  );
});
