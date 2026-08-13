import type {
  ConnectOptions,
  Context,
  IsAuthenticatedResult,
} from "../context.ts";
import {
  AuthenticationResult,
  invalidmaxTopicLevels,
  invalidTopic,
  PacketType,
  ReasonCode,
} from "../deps.ts";
import type {
  ConnackProperties,
  ConnectPacket,
  ExtPublishPacket,
  TReasonCode,
} from "../deps.ts";

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

function reasonToReturnCode(reasonCode: number): number {
  return V4_RETURN_CODE_MAP[reasonCode] ??
    AuthenticationResult.serverUnavailable; // 0x03
}

/**
 * Extracts options from MQTT v5 packet properties.
 */
function extractConnectOptions(packet: ConnectPacket): ConnectOptions {
  if (packet.protocolLevel !== 5) {
    return {};
  }

  return {
    sessionExpiryInterval: packet.properties?.sessionExpiryInterval,
    willDelayInterval: packet.will?.properties?.willDelayInterval,
    topicAliasMaximum: packet.properties?.topicAliasMaximum,
    maximumOutgoingPacketSize: packet.properties?.maximumPacketSize,
    receiveMaximum: packet.properties?.receiveMaximum,
  };
}
/**
 * Builds MQTT v5 CONNACK properties.
 */
function buildConnackProperties(
  ctx: Context,
  opts: {
    assignedClientIdentifier?: string | undefined;
    reasonString?: string | undefined;
    sessionExpiryInterval?: number | undefined;
  },
): ConnackProperties {
  const cfg = ctx.config.context;

  return {
    receiveMaximum: cfg.receiveMaximum,
    maximumQos: cfg.maximumQos,
    retainAvailable: cfg.retainAvailable,
    maximumPacketSize: cfg.maximumIncomingPacketSize,
    topicAliasMaximum: cfg.topicAliasMaximum,
    wildcardSubscriptionAvailable: cfg.wildcardSubscriptionAvailable,
    subscriptionIdentifierAvailable: cfg.subscriptionIdentifierAvailable,
    sharedSubscriptionAvailable: cfg.sharedSubscriptionAvailable,
    serverKeepAlive: cfg.serverKeepAlive,

    // Conditionally included fields
    ...(opts.assignedClientIdentifier && {
      assignedClientIdentifier: opts.assignedClientIdentifier,
    }),
    ...(opts.sessionExpiryInterval !== undefined && {
      sessionExpiryInterval: opts.sessionExpiryInterval,
    }),
    ...(opts.reasonString && cfg.provideReasonStrings && {
      reasonString: opts.reasonString,
    }),
  };
}

/**
 * Checks if client credentials are valid.
 */
async function authenticateClient(
  ctx: Context,
  packet: ConnectPacket,
): Promise<IsAuthenticatedResult> {
  if (ctx.handlers.isAuthenticated) {
    return await ctx.handlers.isAuthenticated(
      ctx,
      packet.clientId || "",
      packet.username || "",
      packet.password || new Uint8Array(0),
      packet,
    );
  }
  return { reasonCode: ReasonCode.success };
}

/**
 * Validates the CONNECT packet structure and Will configuration.
 */
async function validateConnectPacket(
  ctx: Context,
  packet: ConnectPacket,
  sessionExpiryInterval: number,
): Promise<{ reasonCode: TReasonCode; reasonString?: string } | null> {
  const cfg = ctx.config.context;

  // Protocol version check
  if (!cfg.protocols.includes(packet.protocolLevel)) {
    return {
      reasonCode: ReasonCode.unsupportedProtocolVersion,
      reasonString: `Protocol version ${packet.protocolLevel} is not supported`,
    };
  }

  // Will message validation
  if (packet.will) {
    const isProtocolV5 = packet.protocolLevel === 5;
    const will = packet.will as ExtPublishPacket;

    if (
      will.topic === "" || invalidTopic(will.topic) ||
      invalidmaxTopicLevels(will.topic, cfg.maxTopicLevels)
    ) {
      return {
        reasonCode: ReasonCode.topicNameInvalid,
        reasonString: "Invalid will topic",
      };
    }

    if (!cfg.retainAvailable && will.retain) {
      return {
        reasonCode: ReasonCode.retainNotSupported,
        reasonString: "Publish will with retain=true is not supported",
      };
    }

    const checkAuthz = ctx.handlers.isAuthorizedToPublish;
    if (checkAuthz && !await checkAuthz(ctx, will.topic)) {
      return {
        reasonCode: ReasonCode.notAuthorized,
        reasonString: `Client not authorized to publish will to ${will.topic}`,
      };
    }

    const qos = will.qos || 0;
    if (qos > cfg.maximumQos) {
      return {
        reasonCode: ReasonCode.qosNotSupported,
        reasonString: `Server does not support publish will with QoS ${qos}`,
      };
    }

    if (isProtocolV5) {
      const requestedInterval = packet.will.properties?.willDelayInterval || 0;
      if (requestedInterval > sessionExpiryInterval) {
        return {
          reasonCode: ReasonCode.payloadFormatInvalid,
          reasonString:
            "Will delay interval larger than allowed session expiry interval",
        };
      }
      const expiryInterval = packet.will.properties?.messageExpiryInterval;
      if (expiryInterval) {
        will.expiresAtMs = Date.now() + expiryInterval * 1000;
      }
    }
  }

  return null;
}

/**
 * Handles the MQTT CONNECT packet.
 */
export async function handleConnect(
  ctx: Context,
  packet: ConnectPacket,
): Promise<void> {
  const isProtocolV5 = packet.protocolLevel === 5;
  const cfg = ctx.config.context;

  // Assign Client ID if missing
  let clientId = packet.clientId;
  let assignedClientIdentifier: string | undefined;
  if (!clientId) {
    assignedClientIdentifier = `Opifex-${crypto.randomUUID()}`;
    clientId = assignedClientIdentifier;
  }

  // Extract connect options for v5
  const connectOpts = extractConnectOptions(packet);
  // Limit session Expiry Interval to server maximum
  connectOpts.sessionExpiryInterval = Math.min(
    connectOpts.sessionExpiryInterval || 0,
    cfg.maxSessionExpiryInterval,
  );

  // Validate Packet & Authenticate Client
  const validationError = await validateConnectPacket(
    ctx,
    packet,
    connectOpts.sessionExpiryInterval,
  );
  const authResult = validationError ?? await authenticateClient(ctx, packet);

  const { reasonCode, reasonString } = authResult;
  const isSuccess = reasonCode === ReasonCode.success;

  // Establish Session on Success
  let sessionPresent = false;
  if (isSuccess) {
    sessionPresent = await ctx.connect(
      packet,
      clientId,
      connectOpts,
    );
  }

  // Send CONNACK
  await ctx.send({
    type: PacketType.connack,
    protocolLevel: packet.protocolLevel,
    sessionPresent,
    ...(isProtocolV5
      ? {
        reasonCode,
        properties: buildConnackProperties(ctx, {
          assignedClientIdentifier,
          reasonString,
          sessionExpiryInterval: connectOpts.sessionExpiryInterval,
        }),
      }
      : { returnCode: reasonToReturnCode(reasonCode) }),
  });

  // Finalize or Terminate Connection
  if (!isSuccess) {
    await ctx.close(false);
    return;
  }

  if (sessionPresent) {
    await ctx.handleRedelivery();
  }
}
