import assert from "node:assert/strict";
import { test } from "node:test";
import { handlePacket } from "./handlePacket.ts";
import { ConnectionState } from "../ConnectionState.ts";
import { AuthenticationResult, MQTTLevel, PacketType } from "../deps.ts";
import type { AnyPacket, PublishPacket } from "../deps.ts";
import { Deferred } from "../../utils/mod.ts";

function createMockContext() {
  const sentPackets: unknown[] = [];
  const receivedPublishes: PublishPacket[] = [];
  const receivedIds: {
    puback: number[];
    pubcomp: number[];
    suback: number[];
    unsuback: number[];
  } = {
    puback: [],
    pubcomp: [],
    suback: [],
    unsuback: [],
  };
  return {
    connectionState: ConnectionState.connecting as string,
    protocolLevel: 4 as const,
    mqttConn: { codecOpts: { protocolLevel: MQTTLevel.unknown } },
    pingTimer: { reset: () => {}, clear: () => {} },
    unresolvedConnect: new Deferred<number>(),
    store: {
      pendingOutgoing: new Map<number, unknown>(),
      pendingIncoming: new Map<number, PublishPacket>(),
      pendingAckOutgoing: new Map<number, unknown>(),
      async *pendingOutgoingPackets() {},
    },
    send: (packet: unknown) => {
      sentPackets.push(packet);
    },
    receivePublish: (packet: PublishPacket) => {
      receivedPublishes.push(packet);
    },
    receivePuback: (id: number) => {
      receivedIds.puback.push(id);
      return true;
    },
    receivePubcomp: (id: number) => {
      receivedIds.pubcomp.push(id);
      return true;
    },
    receiveSuback: (id: number, _codes: number[]) => {
      receivedIds.suback.push(id);
      return true;
    },
    receiveUnsuback: (id: number) => {
      receivedIds.unsuback.push(id);
      return true;
    },
    sentPackets,
    receivedPublishes,
    receivedIds,
  };
}

test("handlePacket dispatches CONNACK before connected", async () => {
  const ctx = createMockContext();

  const packet = {
    type: PacketType.connack,
    protocolLevel: 4 as const,
    sessionPresent: false,
    returnCode: AuthenticationResult.ok,
  } as AnyPacket;

  await handlePacket(ctx as never, packet);

  assert.deepStrictEqual(
    ctx.connectionState,
    ConnectionState.connected,
    "Should handle CONNACK and set connected state",
  );
});

test("handlePacket rejects non-CONNACK before connected", async () => {
  const ctx = createMockContext();

  const packet = {
    type: PacketType.pingreq,
    protocolLevel: 4,
  } as AnyPacket;

  await assert.rejects(
    handlePacket(ctx as never, packet),
    /before connect/,
    "Should reject packets before CONNACK",
  );
});

test("handlePacket dispatches PUBLISH after connected", async () => {
  const ctx = createMockContext();
  ctx.connectionState = ConnectionState.connected;

  const packet = {
    type: PacketType.publish,
    protocolLevel: 4 as const,
    topic: "test/topic",
    payload: new Uint8Array([1, 2, 3]),
    qos: 0 as const,
    retain: false,
    dup: false,
  } as AnyPacket;

  await handlePacket(ctx as never, packet);

  assert.deepStrictEqual(
    ctx.receivedPublishes.length,
    1,
    "Should dispatch PUBLISH to handler",
  );
});

test("handlePacket dispatches PUBACK after connected", async () => {
  const ctx = createMockContext();
  ctx.connectionState = ConnectionState.connected;

  const packet = {
    type: PacketType.puback,
    protocolLevel: 4 as const,
    id: 1,
  } as AnyPacket;

  await handlePacket(ctx as never, packet);

  assert.deepStrictEqual(
    ctx.receivedIds.puback,
    [1],
    "Should dispatch PUBACK to handler",
  );
});

test("handlePacket dispatches PINGRES silently", async () => {
  const ctx = createMockContext();
  ctx.connectionState = ConnectionState.connected;

  const packet = {
    type: PacketType.pingres,
    protocolLevel: 4,
  } as AnyPacket;

  // Should not throw
  await handlePacket(ctx as never, packet);

  // PINGRES is silently handled (no specific action)
  assert.deepStrictEqual(ctx.sentPackets.length, 0);
});

test("handlePacket dispatches SUBACK after connected", async () => {
  const ctx = createMockContext();
  ctx.connectionState = ConnectionState.connected;
  ctx.store.pendingOutgoing.set(1, { type: PacketType.subscribe });

  const packet = {
    type: PacketType.suback,
    protocolLevel: 4 as const,
    id: 1,
    returnCodes: [0],
  } as AnyPacket;

  await handlePacket(ctx as never, packet);

  assert.deepStrictEqual(
    ctx.receivedIds.suback,
    [1],
    "Should dispatch SUBACK to handler",
  );
});

test("handlePacket dispatches UNSUBACK after connected", async () => {
  const ctx = createMockContext();
  ctx.connectionState = ConnectionState.connected;
  ctx.store.pendingOutgoing.set(2, { type: PacketType.unsubscribe });

  const packet = {
    type: PacketType.unsuback,
    protocolLevel: 4 as const,
    id: 2,
  } as AnyPacket;

  await handlePacket(ctx as never, packet);

  assert.deepStrictEqual(
    ctx.receivedIds.unsuback,
    [2],
    "Should dispatch UNSUBACK to handler",
  );
});

test("handlePacket rejects unexpected packet types", async () => {
  const ctx = createMockContext();
  ctx.connectionState = ConnectionState.connected;

  // CONNECT shouldn't be received by client after connection
  const packet = {
    type: PacketType.connect,
    protocolName: "MQTT",
    protocolLevel: 4 as const,
    clientId: "test",
    clean: true,
    keepAlive: 0,
  } as AnyPacket;

  await assert.rejects(
    handlePacket(ctx as never, packet),
    /unexpected/i,
    "Should reject unexpected packet types",
  );
});

test("handlePacket handles QoS 2 flow packets", async () => {
  const ctx = createMockContext();
  ctx.connectionState = ConnectionState.connected;

  // Test PUBREC
  ctx.store.pendingOutgoing.set(10, { type: PacketType.publish, id: 10 });
  await handlePacket(ctx as never, {
    type: PacketType.pubrec,
    protocolLevel: 4,
    id: 10,
  } as AnyPacket);
  assert.deepStrictEqual(ctx.sentPackets.length, 1);
  assert.deepStrictEqual(
    (ctx.sentPackets[0] as { type: number }).type,
    PacketType.pubrel,
  );

  // Test PUBCOMP
  ctx.store.pendingAckOutgoing.set(10, { type: PacketType.pubrel, id: 10 });
  await handlePacket(ctx as never, {
    type: PacketType.pubcomp,
    protocolLevel: 4,
    id: 10,
  } as AnyPacket);
  assert.deepStrictEqual(ctx.receivedIds.pubcomp, [10]);
});
