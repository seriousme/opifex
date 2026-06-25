import assert from "node:assert/strict";
import { test } from "node:test";
import { handlePublish } from "./handlePublish.ts";
import { PacketType } from "../deps.ts";
import type { PublishPacket } from "../deps.ts";

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

test("handlePublish QoS 0 delivers message without acknowledgment", async () => {
  const ctx = createMockContext();
  const packet = {
    type: PacketType.publish,
    protocolLevel: 4 as const,
    topic: "test/topic",
    payload: new Uint8Array([1, 2, 3]),
    qos: 0 as const,
    retain: false,
    dup: false,
  } as PublishPacket;

  await handlePublish(ctx as never, packet);

  assert.deepStrictEqual(
    ctx.receivedPublishes.length,
    1,
    "Should receive publish",
  );
  assert.deepStrictEqual(
    ctx.sentPackets.length,
    0,
    "QoS 0 should not send acknowledgment",
  );
});

test("handlePublish QoS 1 delivers message and sends PUBACK", async () => {
  const ctx = createMockContext();
  const packet = {
    type: PacketType.publish,
    protocolLevel: 4 as const,
    topic: "test/topic",
    payload: new Uint8Array([1, 2, 3]),
    qos: 1 as const,
    retain: false,
    dup: false,
    id: 1,
  } as PublishPacket;

  await handlePublish(ctx as never, packet);

  assert.deepStrictEqual(
    ctx.receivedPublishes.length,
    1,
    "Should receive publish",
  );
  assert.deepStrictEqual(
    ctx.sentPackets.length,
    1,
    "Should send PUBACK",
  );
  assert.deepStrictEqual(
    (ctx.sentPackets[0] as { type: number }).type,
    PacketType.puback,
    "Should send PUBACK packet",
  );
  assert.deepStrictEqual(
    (ctx.sentPackets[0] as { id: number }).id,
    1,
    "PUBACK should have same packet ID",
  );
});

test("handlePublish QoS 2 stores message and sends PUBREC", async () => {
  const ctx = createMockContext();
  const packet = {
    type: PacketType.publish,
    protocolLevel: 4 as const,
    topic: "test/topic",
    payload: new Uint8Array([1, 2, 3]),
    qos: 2 as const,
    retain: false,
    dup: false,
    id: 2,
  } as PublishPacket;

  await handlePublish(ctx as never, packet);

  // QoS 2: should NOT deliver message yet (waits for PUBREL)
  assert.deepStrictEqual(
    ctx.receivedPublishes.length,
    0,
    "QoS 2 should not deliver message until PUBREL",
  );

  // Should store the packet
  assert.deepStrictEqual(
    ctx.store.pendingIncoming.has(2),
    true,
    "Should store incoming packet",
  );

  // Should send PUBREC
  assert.deepStrictEqual(
    ctx.sentPackets.length,
    1,
    "Should send PUBREC",
  );
  assert.deepStrictEqual(
    (ctx.sentPackets[0] as { type: number }).type,
    PacketType.pubrec,
    "Should send PUBREC packet",
  );
  assert.deepStrictEqual(
    (ctx.sentPackets[0] as { id: number }).id,
    2,
    "PUBREC should have same packet ID",
  );
});

test("handlePublish without packet ID for QoS 1 does nothing", async () => {
  const ctx = createMockContext();
  const packet = {
    type: PacketType.publish,
    protocolLevel: 4 as const,
    topic: "test/topic",
    payload: new Uint8Array([1, 2, 3]),
    qos: 1 as const,
    retain: false,
    dup: false,
    // No id
  } as PublishPacket;

  await handlePublish(ctx as never, packet);

  // Without packet ID, QoS 1/2 handling is skipped
  assert.deepStrictEqual(
    ctx.receivedPublishes.length,
    0,
    "Should not receive without packet ID",
  );
  assert.deepStrictEqual(
    ctx.sentPackets.length,
    0,
    "Should not send without packet ID",
  );
});

test("handlePublish QoS 2 without store does nothing", async () => {
  const ctx = createMockContext();
  (ctx as unknown as { store: null }).store = null as never;
  const packet = {
    type: PacketType.publish,
    protocolLevel: 4 as const,
    topic: "test/topic",
    payload: new Uint8Array([1, 2, 3]),
    qos: 2 as const,
    retain: false,
    dup: false,
    id: 3,
  } as PublishPacket;

  // Should not throw, just silently skip
  await handlePublish(ctx as never, packet);

  assert.deepStrictEqual(
    ctx.sentPackets.length,
    0,
    "Should not send without store",
  );
});
