import assert from "node:assert/strict";
import { test } from "node:test";
import { handleUnsuback } from "./handleUnsuback.ts";
import { PacketType } from "../deps.ts";
import type { UnsubackPacket } from "../deps.ts";

function createMockContext() {
  const receivedIds: number[] = [];
  return {
    protocolLevel: 4 as const,
    store: {
      pendingOutgoing: new Map<number, unknown>(),
      pendingIncoming: new Map(),
      pendingAckOutgoing: new Map(),
    },
    receiveUnsuback: (id: number) => {
      receivedIds.push(id);
      return true;
    },
    receivedIds,
  };
}

test("handleUnsuback removes from pending and notifies context", () => {
  const ctx = createMockContext();
  ctx.store.pendingOutgoing.set(1, { type: PacketType.unsubscribe, id: 1 });

  const packet = {
    type: PacketType.unsuback,
    protocolLevel: 4 as const,
    id: 1,
  } as UnsubackPacket;

  handleUnsuback(ctx as never, packet);

  assert.deepStrictEqual(
    ctx.store.pendingOutgoing.has(1),
    false,
    "Should remove from pending",
  );
  assert.deepStrictEqual(
    ctx.receivedIds,
    [1],
    "Should notify context of unsuback",
  );
});

test("handleUnsuback handles non-existent packet ID gracefully", () => {
  const ctx = createMockContext();

  const packet = {
    type: PacketType.unsuback,
    protocolLevel: 4 as const,
    id: 999,
  } as UnsubackPacket;

  // Should not throw
  handleUnsuback(ctx as never, packet);

  assert.deepStrictEqual(
    ctx.receivedIds,
    [999],
    "Should still notify context",
  );
});

test("handleUnsuback processes multiple UNSUBACKs correctly", () => {
  const ctx = createMockContext();
  ctx.store.pendingOutgoing.set(1, { type: PacketType.unsubscribe, id: 1 });
  ctx.store.pendingOutgoing.set(2, { type: PacketType.unsubscribe, id: 2 });
  ctx.store.pendingOutgoing.set(3, { type: PacketType.unsubscribe, id: 3 });

  handleUnsuback(ctx as never, {
    type: PacketType.unsuback,
    protocolLevel: 4,
    id: 2,
  } as UnsubackPacket);

  assert.deepStrictEqual(ctx.store.pendingOutgoing.has(1), true);
  assert.deepStrictEqual(ctx.store.pendingOutgoing.has(2), false);
  assert.deepStrictEqual(ctx.store.pendingOutgoing.has(3), true);
  assert.deepStrictEqual(ctx.receivedIds, [2]);
});

test("handleUnsuback works with MQTT v5", () => {
  const ctx = createMockContext();
  ctx.store.pendingOutgoing.set(5, { type: PacketType.unsubscribe, id: 5 });

  const packet = {
    type: PacketType.unsuback,
    protocolLevel: 5 as const,
    id: 5,
    reasonCodes: [0],
    properties: {},
  } as UnsubackPacket;

  handleUnsuback(ctx as never, packet);

  assert.deepStrictEqual(ctx.store.pendingOutgoing.has(5), false);
  assert.deepStrictEqual(ctx.receivedIds, [5]);
});
