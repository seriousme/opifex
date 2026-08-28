import assert from "node:assert/strict";
import { test } from "node:test";
import { handleAuth } from "./handleAuth.ts";
import { ConnectionState } from "../ConnectionState.ts";
import { PacketType, ReasonCode } from "../deps.ts";
import type { AuthPacket } from "../deps.ts";
import type { AuthenticatedResult } from "../context.ts";
import { Deferred } from "../../utils/mod.ts";

function createMockContext() {
  const sentPackets: unknown[] = [];
  return {
    connectionState: ConnectionState.connecting as string,
    pingTimer: { clear: () => {} },
    unresolvedConnect: new Deferred<number>(),
    authHandler: (
      _ctx: unknown,
      _authMethod: string,
      _authData: Uint8Array,
    ): Promise<AuthenticatedResult> => {
      return Promise.resolve({
        reasonCode: ReasonCode.continueAuthentication,
        authData: new Uint8Array([1, 2, 3]),
      });
    },
    send: (packet: unknown) => {
      sentPackets.push(packet);
    },
    sentPackets,
  };
}

test("handleAuth sets connected state on ReasonCode.success", async () => {
  const ctx = createMockContext();
  const packet: AuthPacket = {
    type: PacketType.auth,
    protocolLevel: 5 as const,
    reasonCode: ReasonCode.success,
  };

  await handleAuth(ctx as never, packet);

  assert.deepStrictEqual(
    ctx.connectionState,
    ConnectionState.connected,
    "Should set connection state to connected when reasonCode is success",
  );
});

test("handleAuth handles authentication failure when connecting", async () => {
  const ctx = createMockContext();
  ctx.connectionState = ConnectionState.connecting;

  const packet: AuthPacket = {
    type: PacketType.auth,
    protocolLevel: 5 as const,
    reasonCode: ReasonCode.badAuthenticationMethod,
  };

  await handleAuth(ctx as never, packet);

  assert.deepStrictEqual(
    ctx.connectionState,
    ConnectionState.disconnecting,
    "Should transition state to disconnecting on failure during connect",
  );

  await assert.rejects(
    ctx.unresolvedConnect.promise,
    /Connect failed/,
    "Should reject unresolvedConnect with connect failed error",
  );
});

test("handleAuth throws error on authentication failure when connected", async () => {
  const ctx = createMockContext();
  ctx.connectionState = ConnectionState.connected;

  const packet: AuthPacket = {
    type: PacketType.auth,
    protocolLevel: 5 as const,
    reasonCode: ReasonCode.badAuthenticationMethod,
  };

  await assert.rejects(
    async () => {
      await handleAuth(ctx as never, packet);
    },
    Error,
    "Should throw an error if reasonCode indicates failure after already connected",
  );
});

test("handleAuth throws error if authMethod or authData is missing", async () => {
  const ctx = createMockContext();
  const packet: AuthPacket = {
    type: PacketType.auth,
    protocolLevel: 5 as const,
    reasonCode: ReasonCode.continueAuthentication,
    properties: {
      authenticationMethod: "SCRAM-SHA-256",
      // authenticationData missing
    },
  };

  await assert.rejects(
    async () => {
      await handleAuth(ctx as never, packet);
    },
    /Auth method and\/or Auth data missing/,
    "Should throw when missing required auth properties",
  );
});

test("handleAuth transitions state and sends response packet on continueAuthentication success", async () => {
  const ctx = createMockContext();
  ctx.connectionState = ConnectionState.connected;

  ctx.authHandler =  () => Promise.resolve({
    reasonCode: ReasonCode.continueAuthentication,
    authData: new Uint8Array([4, 5, 6]),
    reasonString: "Continue",
  });

  const packet: AuthPacket = {
    type: PacketType.auth,
    protocolLevel: 5 as const,
    reasonCode: ReasonCode.continueAuthentication,
    properties: {
      authenticationMethod: "SCRAM-SHA-256",
      authenticationData: new Uint8Array([1, 2, 3]),
    },
  };

  await handleAuth(ctx as never, packet);

  assert.deepStrictEqual(
    ctx.connectionState,
    ConnectionState.authenticating,
    "Should transition connection state to authenticating",
  );
  assert.deepStrictEqual(
    ctx.sentPackets.length,
    1,
    "Should send a response auth packet",
  );
  assert.deepStrictEqual(ctx.sentPackets[0], {
    type: PacketType.auth,
    protocolLevel: 5,
    reasonCode: ReasonCode.continueAuthentication,
    properties: {
      authenticationMethod: "SCRAM-SHA-256",
      authenticationData: new Uint8Array([4, 5, 6]),
      reasonString: "Continue",
    },
  });
});

test("handleAuth handles failure result from authHandler", async () => {
  const ctx = createMockContext();
  ctx.connectionState = ConnectionState.connecting;

  ctx.authHandler = () =>
    Promise.resolve({
      reasonCode: ReasonCode.notAuthorized,
      reasonString: "Not authorized to proceed",
    });

  const packet: AuthPacket = {
    type: PacketType.auth,
    protocolLevel: 5 as const,
    reasonCode: ReasonCode.continueAuthentication,
    properties: {
      authenticationMethod: "SCRAM-SHA-256",
      authenticationData: new Uint8Array([1, 2, 3]),
    },
  };

  await handleAuth(ctx as never, packet);

  assert.deepStrictEqual(
    ctx.connectionState,
    ConnectionState.disconnecting,
    "Should set state to disconnecting on authHandler failure",
  );

  await assert.rejects(
    ctx.unresolvedConnect.promise,
    /Connect failed: Not authorized to proceed/,
    "Should reject unresolvedConnect with the reasonString provided by authHandler",
  );
});
