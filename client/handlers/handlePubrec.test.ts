import assert from "node:assert/strict";
import { test } from "node:test";
import { handlePubrec } from "./handlePubrec.ts";
import { PacketType } from "../deps.ts";
import type { PubrecPacket } from "../deps.ts";

function createMockContext() {
  const sentPackets: unknown[] = [];
  return {
    protocolLevel: 4 as const,
    store: {
      pendingOutgoing: new Map<number, unknown>(),
      pendingIncoming: new Map(),
      pendingAckOutgoing: new Map<number, unknown>(),
    },
    send: (packet: unknown) => {
      sentPackets.push(packet);
    },
    sentPackets,
  };
}

test("handlePubrec sends PUBREL for pending outgoing QoS 2", async () => {
  const ctx = createMockContext();
  ctx.store.pendingOutgoing.set(1, { type: PacketType.publish, id: 1 });

  const packet = {
    type: PacketType.pubrec,
    protocolLevel: 4 as const,
    id: 1,
  } as PubrecPacket;

  await handlePubrec(ctx as never, packet);

  // Should send PUBREL
  assert.deepStrictEqual(ctx.sentPackets.length, 1, "Should send PUBREL");
  assert.deepStrictEqual(
    (ctx.sentPackets[0] as { type: number }).type,
    PacketType.pubrel,
    "Should send PUBREL packet",
  );
  assert.deepStrictEqual(
    (ctx.sentPackets[0] as { id: number }).id,
    1,
    "PUBREL should have same packet ID",
  );

  // Should move from pendingOutgoing to pendingAckOutgoing
  assert.deepStrictEqual(
    ctx.store.pendingOutgoing.has(1),
    false,
    "Should remove from pendingOutgoing",
  );
  assert.deepStrictEqual(
    ctx.store.pendingAckOutgoing.has(1),
    true,
    "Should add to pendingAckOutgoing",
  );
});

test("handlePubrec ignores unknown packet ID", async () => {
  const ctx = createMockContext();

  const packet = {
    type: PacketType.pubrec,
    protocolLevel: 4 as const,
    id: 999,
  } as PubrecPacket;

  await handlePubrec(ctx as never, packet);

  assert.deepStrictEqual(
    ctx.sentPackets.length,
    0,
    "Should not send PUBREL for unknown ID",
  );
  assert.deepStrictEqual(
    ctx.store.pendingAckOutgoing.has(999),
    false,
    "Should not add to pendingAckOutgoing",
  );
});

test("handlePubrec stores PUBREL packet for retransmission", async () => {
  const ctx = createMockContext();
  ctx.store.pendingOutgoing.set(5, { type: PacketType.publish, id: 5 });

  const packet = {
    type: PacketType.pubrec,
    protocolLevel: 4 as const,
    id: 5,
  } as PubrecPacket;

  await handlePubrec(ctx as never, packet);

  const storedPubrel = ctx.store.pendingAckOutgoing.get(5);
  assert.ok(storedPubrel, "Should store PUBREL");
  assert.deepStrictEqual(
    (storedPubrel as { type: number }).type,
    PacketType.pubrel,
    "Stored packet should be PUBREL",
  );
});
