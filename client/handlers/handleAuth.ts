import type { AuthenticatedResult, Context } from "../context.ts";
import { ConnectionState } from "../ConnectionState.ts";
import { PacketType, ReasonCode, ReasonCodeByNumber } from "../deps.ts";
import type { AuthPacket } from "../deps.ts";

/**
 * Handle error
 */

function handleError(ctx: Context, errMsg: string) {
  if (ctx.connectionState === ConnectionState.connecting) {
    const err = new Error(
      `Connect failed: ${errMsg}`,
    );
    ctx.connectionState = ConnectionState.disconnecting;
    ctx.pingTimer?.clear();
    ctx.unresolvedConnect?.reject(err);
    return;
  }
  throw new Error(errMsg);
}

/**
 * Handle success
 */

async function handleResult(
  ctx: Context,
  authMethod: string,
  result: AuthenticatedResult,
) {
  await ctx.send({
    type: PacketType.auth,
    protocolLevel: 5,
    reasonCode: result.reasonCode,
    properties: result.authData
      ? {
        authenticationMethod: authMethod,
        authenticationData: result.authData,
        reasonString: result.reasonString,
      }
      : {},
  });
}

/**
 * Handles v5 Auth packet
 * @param ctx - The connection context containing send method
 * @returns Promise that resolves
 */

export async function handleAuth(
  ctx: Context,
  authPacket: AuthPacket,
): Promise<void> {
  const reasonCode = authPacket.reasonCode;
  if (reasonCode === ReasonCode.success) {
    // we are connected again
    ctx.connectionState = ConnectionState.connected;
    return;
  }

  if (reasonCode !== ReasonCode.continueAuthentication) {
    // something went wrong
    handleError(ctx, ReasonCodeByNumber[reasonCode]);
    return;
  }

  // we need to send something back
  if (ctx.connectionState === ConnectionState.connected) {
    // pauze auther activities
    ctx.connectionState = ConnectionState.authenticating;
  }

  const authMethod = authPacket.properties?.authenticationMethod;
  const authData = authPacket.properties?.authenticationData;
  if (!(authMethod && authData)) {
    throw new Error("Auth method and/or Auth data missing");
  }
  const result = await ctx.authHandler(
    ctx,
    authMethod,
    authData,
  );
  if (result.reasonCode === ReasonCode.continueAuthentication) {
    return handleResult(ctx, authMethod, result);
  }
  return handleError(ctx, result.reasonString || "Error during authentication");
}
