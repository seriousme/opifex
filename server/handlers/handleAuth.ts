import { SessionState } from "../context.ts";
import type { AuthenticatedResult, Context } from "../context.ts";
import { PacketType, ReasonCode } from "../deps.ts";
import type { AuthPacket } from "../deps.ts";

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
 * Handle errors
 */

async function handleError(ctx: Context, result?: AuthenticatedResult) {
  await ctx.send({
    type: PacketType.disconnect,
    protocolLevel: 5,
    reasonCode: result?.reasonCode ?? ReasonCode.badAuthenticationMethod,
    properties: {
      reasonString: result?.reasonString ?? "Bad authentication mode",
    },
  });
  await ctx.close(false);
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
  if (ctx.handlers.processAuth) {
    const authMethod = authPacket.properties?.authenticationMethod;
    const authData = authPacket.properties?.authenticationData;
    if (!(authMethod && authData)) {
      return await ctx.close(false);
    }
    const result = await ctx.handlers.processAuth(
      ctx,
      ctx.clientId!,
      authMethod,
      authData,
    );
    if (result.reasonCode === ReasonCode.success) {
      ctx.state = SessionState.connected;
      return handleResult(ctx, authMethod, result);
    }
    if (result.reasonCode === ReasonCode.continueAuthentication) {
      return handleResult(ctx, authMethod, result);
    }
    return handleError(ctx, result);
  }
  return handleError(ctx);
}
