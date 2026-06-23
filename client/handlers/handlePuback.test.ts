import assert from "node:assert/strict";
import { test } from "node:test";
import { handlePuback } from "./handlePuback.ts";
import { PacketType } from "../deps.ts";
import type { PubackPacket } from "../deps.ts";

function createMockContext() {
  const receivedIds: number[] = [];
  return {
    protocolLevel: 4 as const,
    store: {
      pendingOutgoing: new Map<number, unknown>(),
      pendingIncoming: new Map(),
      pendingAckOutgoing: new Map(),
    },
    receivePuback: (id: number) => {
      receivedIds.push(id);
      return true;
    },
    receivedIds,
  };
}

test("handlePuback removes packet from pending and notifies context", () => {
  const ctx = createMockContext();
  ctx.store.pendingOutgoing.set(1, { type: PacketType.publish });

  const packet = {
    type: PacketType.puback,
    protocolLevel: 4 as const,
    id: 1,
  } as PubackPacket;

  handlePuback(ctx as never, packet);

  assert.deepStrictEqual(
    ctx.store.pendingOutgoing.has(1),
    false,
    "Should remove from pending",
  );
  assert.deepStrictEqual(
    ctx.receivedIds,
    [1],
    "Should notify context of puback",
  );
});

test("handlePuback handles non-existent packet ID gracefully", () => {
  const ctx = createMockContext();

  const packet = {
    type: PacketType.puback,
    protocolLevel: 4 as const,
    id: 999,
  } as PubackPacket;

  // Should not throw
  handlePuback(ctx as never, packet);

  assert.deepStrictEqual(
    ctx.receivedIds,
    [999],
    "Should still notify context",
  );
});

test("handlePuback processes multiple PUBACKs correctly", () => {
  const ctx = createMockContext();
  ctx.store.pendingOutgoing.set(1, { type: PacketType.publish });
  ctx.store.pendingOutgoing.set(2, { type: PacketType.publish });
  ctx.store.pendingOutgoing.set(3, { type: PacketType.publish });

  handlePuback(ctx as never, {
    type: PacketType.puback,
    protocolLevel: 4,
    id: 2,
  } as PubackPacket);

  assert.deepStrictEqual(ctx.store.pendingOutgoing.has(1), true);
  assert.deepStrictEqual(ctx.store.pendingOutgoing.has(2), false);
  assert.deepStrictEqual(ctx.store.pendingOutgoing.has(3), true);
  assert.deepStrictEqual(ctx.receivedIds, [2]);
});
