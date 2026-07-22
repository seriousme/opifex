import assert from "node:assert/strict";
import { test } from "node:test";
import { handlePubcomp } from "./handlePubcomp.ts";
import { PacketType, ReasonCode, ReasonCodeByNumber } from "../deps.ts";
import type { PubcompPacket } from "../deps.ts";

function createMockContext() {
  const receivedIds: number[] = [];
  return {
    protocolLevel: 4 as const,
    store: {
      pendingOutgoing: new Map(),
      pendingIncoming: new Map(),
      pendingAckOutgoing: new Map<number, unknown>(),
    },
    receivePubcomp: (id: number) => {
      receivedIds.push(id);
      return true;
    },
    receivedIds,
  };
}

test("handlePubcomp removes from pendingAckOutgoing and notifies", () => {
  const ctx = createMockContext();
  ctx.store.pendingAckOutgoing.set(1, { type: PacketType.pubrel, id: 1 });

  const packet = {
    type: PacketType.pubcomp,
    protocolLevel: 4 as const,
    id: 1,
  } as PubcompPacket;

  handlePubcomp(ctx as never, packet);

  assert.deepStrictEqual(
    ctx.store.pendingAckOutgoing.has(1),
    false,
    "Should remove from pendingAckOutgoing",
  );
  assert.deepStrictEqual(
    ctx.receivedIds,
    [1],
    "Should notify context of pubcomp",
  );
});

test("handlePubcomp ignores unknown packet ID", () => {
  const ctx = createMockContext();

  const packet = {
    type: PacketType.pubcomp,
    protocolLevel: 4 as const,
    id: 999,
  } as PubcompPacket;

  handlePubcomp(ctx as never, packet);

  // Should not notify for unknown ID (based on implementation)
  assert.deepStrictEqual(
    ctx.receivedIds.length,
    0,
    "Should not notify for unknown ID",
  );
});

test("handlePubcomp completes QoS 2 outgoing flow", () => {
  const ctx = createMockContext();

  // Simulate QoS 2 state after PUBREC was received
  ctx.store.pendingAckOutgoing.set(5, { type: PacketType.pubrel, id: 5 });

  handlePubcomp(ctx as never, {
    type: PacketType.pubcomp,
    protocolLevel: 4,
    id: 5,
  } as PubcompPacket);

  assert.deepStrictEqual(ctx.store.pendingAckOutgoing.size, 0);
  assert.deepStrictEqual(ctx.receivedIds, [5]);
});

test("handlePubcomp processes multiple PUBCOMPs correctly", () => {
  const ctx = createMockContext();
  ctx.store.pendingAckOutgoing.set(1, { type: PacketType.pubrel, id: 1 });
  ctx.store.pendingAckOutgoing.set(2, { type: PacketType.pubrel, id: 2 });
  ctx.store.pendingAckOutgoing.set(3, { type: PacketType.pubrel, id: 3 });

  handlePubcomp(ctx as never, {
    type: PacketType.pubcomp,
    protocolLevel: 4,
    id: 2,
  } as PubcompPacket);

  assert.deepStrictEqual(ctx.store.pendingAckOutgoing.has(1), true);
  assert.deepStrictEqual(ctx.store.pendingAckOutgoing.has(2), false);
  assert.deepStrictEqual(ctx.store.pendingAckOutgoing.has(3), true);
  assert.deepStrictEqual(ctx.receivedIds, [2]);
});

test("handlePubComp processes V5 rejection", () => {
  const ctx = createMockContext();
  ctx.store.pendingAckOutgoing.set(3, { type: PacketType.pubrel, id: 3 });
  const reasonCode = ReasonCode.notAuthorized;
  assert.throws(() =>
    handlePubcomp(ctx as never, {
      type: PacketType.pubcomp,
      protocolLevel: 5,
      id: 3,
      reasonCode,
    } as PubcompPacket), Error(ReasonCodeByNumber[reasonCode]));
});
