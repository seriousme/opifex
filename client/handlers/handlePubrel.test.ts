import assert from "node:assert/strict";
import { test } from "node:test";
import { handlePubrel } from "./handlePubrel.ts";
import { PacketType } from "../deps.ts";
import type { PublishPacket, PubrelPacket } from "../deps.ts";

function createMockContext() {
  const sentPackets: unknown[] = [];
  const receivedPublishes: PublishPacket[] = [];
  return {
    protocolLevel: 4 as const,
    store: {
      pendingOutgoing: new Map(),
      pendingIncoming: new Map<number, PublishPacket>(),
      pendingAckOutgoing: new Map(),
    },
    send: (packet: unknown) => {
      sentPackets.push(packet);
    },
    receivePublish: (packet: PublishPacket) => {
      receivedPublishes.push(packet);
    },
    sentPackets,
    receivedPublishes,
  };
}

test("handlePubrel delivers stored message and sends PUBCOMP", async () => {
  const ctx = createMockContext();
  const storedPublish = {
    type: PacketType.publish,
    protocolLevel: 4 as const,
    topic: "test/topic",
    payload: new Uint8Array([1, 2, 3]),
    qos: 2 as const,
    retain: false,
    dup: false,
    id: 1,
  } as PublishPacket;
  ctx.store.pendingIncoming.set(1, storedPublish);

  const packet = {
    type: PacketType.pubrel,
    protocolLevel: 4 as const,
    id: 1,
  } as PubrelPacket;

  await handlePubrel(ctx as never, packet);

  // Should deliver the message
  assert.deepStrictEqual(
    ctx.receivedPublishes.length,
    1,
    "Should deliver stored message",
  );
  assert.deepStrictEqual(
    ctx.receivedPublishes[0].topic,
    "test/topic",
    "Should deliver correct message",
  );

  // Should send PUBCOMP
  assert.deepStrictEqual(ctx.sentPackets.length, 1, "Should send PUBCOMP");
  assert.deepStrictEqual(
    (ctx.sentPackets[0] as { type: number }).type,
    PacketType.pubcomp,
    "Should send PUBCOMP packet",
  );
  assert.deepStrictEqual(
    (ctx.sentPackets[0] as { id: number }).id,
    1,
    "PUBCOMP should have same packet ID",
  );

  // Should remove from pending incoming
  assert.deepStrictEqual(
    ctx.store.pendingIncoming.has(1),
    false,
    "Should remove from pendingIncoming",
  );
});

test("handlePubrel ignores unknown packet ID", async () => {
  const ctx = createMockContext();

  const packet = {
    type: PacketType.pubrel,
    protocolLevel: 4 as const,
    id: 999,
  } as PubrelPacket;

  await handlePubrel(ctx as never, packet);

  assert.deepStrictEqual(
    ctx.receivedPublishes.length,
    0,
    "Should not deliver for unknown ID",
  );
  assert.deepStrictEqual(
    ctx.sentPackets.length,
    0,
    "Should not send PUBCOMP for unknown ID",
  );
});

test("handlePubrel completes QoS 2 flow correctly", async () => {
  const ctx = createMockContext();

  // Simulate full QoS 2 flow - message already stored from PUBLISH
  const storedPublish = {
    type: PacketType.publish,
    protocolLevel: 4 as const,
    topic: "sensors/temp",
    payload: new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]), // "Hello"
    qos: 2 as const,
    retain: false,
    dup: false,
    id: 42,
  } as PublishPacket;
  ctx.store.pendingIncoming.set(42, storedPublish);

  await handlePubrel(ctx as never, {
    type: PacketType.pubrel,
    protocolLevel: 4,
    id: 42,
  } as PubrelPacket);

  // Verify complete flow
  assert.deepStrictEqual(ctx.receivedPublishes.length, 1);
  assert.deepStrictEqual(ctx.receivedPublishes[0], storedPublish);
  assert.deepStrictEqual(
    (ctx.sentPackets[0] as { type: number }).type,
    PacketType.pubcomp,
  );
  assert.deepStrictEqual(ctx.store.pendingIncoming.size, 0);
});
