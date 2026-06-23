import assert from "node:assert/strict";
import { test } from "node:test";
import { handleConnack } from "./handleConnack.ts";
import { ConnectionState } from "../ConnectionState.ts";
import { AuthenticationResult, MQTTLevel } from "../deps.ts";
import type { ConnackPacket } from "../deps.ts";
import { Deferred } from "../../utils/mod.ts";

function createMockContext() {
  const sentPackets: unknown[] = [];
  return {
    connectionState: ConnectionState.connecting as string,
    protocolLevel: 4 as const,
    mqttConn: { codecOpts: { protocolLevel: MQTTLevel.unknown } },
    pingTimer: { reset: () => {}, clear: () => {} },
    unresolvedConnect: new Deferred<number>(),
    store: {
      pendingOutgoing: new Map(),
      pendingIncoming: new Map(),
      pendingAckOutgoing: new Map(),
      async *pendingOutgoingPackets() {},
    },
    send: (packet: unknown) => {
      sentPackets.push(packet);
    },
    sentPackets,
  };
}

test("handleConnack sets connected state on success", async () => {
  const ctx = createMockContext();
  const packet = {
    type: 2,
    protocolLevel: 4 as const,
    sessionPresent: false,
    returnCode: AuthenticationResult.ok,
  } as ConnackPacket;

  await handleConnack(packet, ctx as never);

  assert.deepStrictEqual(
    ctx.connectionState,
    ConnectionState.connected,
    "Should be connected after successful CONNACK",
  );
});

test("handleConnack resolves connect promise on success", async () => {
  const ctx = createMockContext();
  const packet = {
    type: 2,
    protocolLevel: 4 as const,
    sessionPresent: false,
    returnCode: AuthenticationResult.ok,
  } as ConnackPacket;

  await handleConnack(packet, ctx as never);

  const result = await ctx.unresolvedConnect.promise;
  assert.deepStrictEqual(result, 0, "Should resolve with success code 0");
});

test("handleConnack rejects on bad username/password", async () => {
  const ctx = createMockContext();
  const packet = {
    type: 2,
    protocolLevel: 4 as const,
    sessionPresent: false,
    returnCode: AuthenticationResult.badUsernameOrPassword,
  } as ConnackPacket;

  await handleConnack(packet, ctx as never);

  assert.deepStrictEqual(
    ctx.connectionState,
    ConnectionState.disconnecting,
    "Should be disconnecting on auth failure",
  );

  await assert.rejects(
    ctx.unresolvedConnect.promise,
    /Connect failed/,
    "Should reject with connect failed error",
  );
});

test("handleConnack rejects on not authorized", async () => {
  const ctx = createMockContext();
  const packet = {
    type: 2,
    protocolLevel: 4 as const,
    sessionPresent: false,
    returnCode: AuthenticationResult.notAuthorized,
  } as ConnackPacket;

  await handleConnack(packet, ctx as never);

  assert.deepStrictEqual(
    ctx.connectionState,
    ConnectionState.disconnecting,
  );

  await assert.rejects(
    ctx.unresolvedConnect.promise,
    /Connect failed/,
  );
});

test("handleConnack handles MQTT v5 reason codes", async () => {
  const ctx = createMockContext();
  (ctx as { protocolLevel: number }).protocolLevel = 5;
  const packet = {
    type: 2,
    protocolLevel: 5 as const,
    sessionPresent: false,
    reasonCode: 0,
  } as ConnackPacket;

  await handleConnack(packet, ctx as never);

  assert.deepStrictEqual(
    ctx.connectionState,
    ConnectionState.connected,
    "Should be connected with v5 success reason code",
  );
});

test("handleConnack resets ping timer on success", async () => {
  let timerReset = false;
  const ctx = createMockContext();
  ctx.pingTimer = {
    reset: () => {
      timerReset = true;
    },
    clear: () => {},
  };

  const packet = {
    type: 2,
    protocolLevel: 4 as const,
    sessionPresent: false,
    returnCode: AuthenticationResult.ok,
  } as ConnackPacket;

  await handleConnack(packet, ctx as never);

  assert.deepStrictEqual(timerReset, true, "Ping timer should be reset");
});

test("handleConnack clears ping timer on failure", async () => {
  let timerCleared = false;
  const ctx = createMockContext();
  ctx.pingTimer = {
    reset: () => {},
    clear: () => {
      timerCleared = true;
    },
  };

  const packet = {
    type: 2,
    protocolLevel: 4 as const,
    sessionPresent: false,
    returnCode: AuthenticationResult.badUsernameOrPassword,
  } as ConnackPacket;

  await handleConnack(packet, ctx as never);
  assert.deepStrictEqual(timerCleared, true, "Ping timer should be cleared");
  await assert.rejects(
    ctx.unresolvedConnect.promise,
    /Connect failed/,
  );
});
