import { AuthenticationResult, PacketType, ReasonCode } from "../deps.ts";
import type { ProtocolLevel, TReasonCode } from "../deps.ts";
import type { Context } from "../context.ts";

/**
 * Maps MQTT v5 ReasonCodes to MQTT v3.1.1 ReturnCodes (AuthenticationResult)
 */
const V4_RETURN_CODE_MAP: Record<number, number> = {
  [ReasonCode.success]: AuthenticationResult.ok, // 0x00
  [ReasonCode.unsupportedProtocolVersion]:
    AuthenticationResult.unacceptableProtocol, // 0x01
  [ReasonCode.clientIdentifierNotValid]: AuthenticationResult.rejectedUsername, // 0x02
  [ReasonCode.badUserNameOrPassword]:
    AuthenticationResult.badUsernameOrPassword, // 0x04
  [ReasonCode.badAuthenticationMethod]:
    AuthenticationResult.badUsernameOrPassword, // 0x04
  [ReasonCode.notAuthorized]: AuthenticationResult.notAuthorized, // 0x05
  [ReasonCode.banned]: AuthenticationResult.notAuthorized, // 0x05
};

export function reasonToReturnCode(reasonCode: number): number {
  return V4_RETURN_CODE_MAP[reasonCode] ??
    AuthenticationResult.serverUnavailable; // 0x03
}

/**
 * complete connect
 */
export async function completeConnect(
  ctx: Context,
  protocolLevel: ProtocolLevel,
  reasonCode: TReasonCode,
  reasonString: string | undefined,
) {
  const cfg = ctx.config.context;
  const connectOpts = ctx.connectOptions || {};
  const isSuccess = reasonCode === ReasonCode.success;
  const isProtocolV5 = protocolLevel === 5;

  let sessionPresent = false;
  if (isSuccess) {
    // Establish Session on Success
    sessionPresent = await ctx.connect();
  }

  // Send CONNACK
  const result = isProtocolV5
    ? {
      reasonCode,
      properties: {
        // only send full details on success
        ...(isSuccess
          ? {
            receiveMaximum: cfg.receiveMaximum,
            maximumQos: cfg.maximumQos,
            retainAvailable: cfg.retainAvailable,
            maximumPacketSize: cfg.maximumIncomingPacketSize,
            topicAliasMaximum: cfg.topicAliasMaximum,
            wildcardSubscriptionAvailable: cfg.wildcardSubscriptionAvailable,
            subscriptionIdentifierAvailable:
              cfg.subscriptionIdentifierAvailable,
            sharedSubscriptionAvailable: cfg.sharedSubscriptionAvailable,
            serverKeepAlive: cfg.serverKeepAlive,
            assignedClientIdentifier: connectOpts.assignedClientIdentifier,
            sessionExpiryInterval: connectOpts.sessionExpiryInterval,
          }
          : {}),
        reasonString: reasonString,
      },
    }
    : { returnCode: reasonToReturnCode(reasonCode) };

  await ctx.send({
    type: PacketType.connack,
    protocolLevel,
    sessionPresent,
    ...result,
  });

  // Finalize or Terminate Connection
  if (!isSuccess) {
    await ctx.close(false);
    return;
  }

  // reset connectOptions
  ctx.connectOptions = undefined;

  // start redelivery
  if (sessionPresent) {
    await ctx.handleRedelivery();
  }
}
