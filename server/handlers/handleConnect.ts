import type {
  AuthenticatedResult,
  ConnectOptions,
  Context,
} from "../context.ts";
import {
  invalidmaxTopicLevels,
  invalidTopic,
  logger,
  PacketType,
  ReasonCode,
} from "../deps.ts";
import type { ConnectPacket, ExtPublishPacket } from "../deps.ts";
import { completeConnect } from "./completeConnect.ts";

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
 * Checks if client credentials are valid.
 */
async function authenticateClient(
  ctx: Context,
  clientId: string,
  packet: ConnectPacket,
): Promise<AuthenticatedResult> {
  const isProtocolV5 = packet.protocolLevel === 5;
  const authMethod = isProtocolV5
    ? packet.properties?.authenticationMethod
    : undefined;

  if (ctx.handlers.isAuthenticated) {
    try {
      const result = await ctx.handlers.isAuthenticated(
        ctx,
        clientId,
        packet.username || "",
        packet.password || new Uint8Array(0),
        packet,
      );
      if (
        isProtocolV5 && result.reasonCode === ReasonCode.success &&
        authMethod !== undefined && ctx.handlers.processAuth
      ) {
        const authData = packet.properties?.authenticationData;
        return await ctx.handlers.processAuth(
          ctx,
          clientId,
          authMethod,
          authData!,
        );
      }
      return result;
    } catch (err) {
      let message = "unknown error";
      if (err instanceof Error) {
        message = err.message;
      }
      logger.error(`Authentication failed with error "${message}`);
      return {
        reasonCode: ReasonCode.unspecifiedError,
        reasonString: "Authentication failed",
      };
    }
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
): Promise<AuthenticatedResult | null> {
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

      const authMethod = packet.properties?.authenticationMethod;
      const authData = packet.properties?.authenticationData;

      if (
        // both need to be either present or absent, one is not enough
        (authMethod !== undefined) !== (authData !== undefined) ||
        // authMethod without a handler won't work
        (authMethod !== undefined || !ctx.handlers.processAuth)
      ) {
        return {
          reasonCode: ReasonCode.badAuthenticationMethod,
          reasonString:
            "Bad authentication method or missing authentication data",
        };
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
  let assignedClientIdentifier = undefined;
  if (!clientId) {
    clientId = `Opifex-${crypto.randomUUID()}`;
    assignedClientIdentifier = clientId;
  }

  // Extract connect options for v5
  const connectOpts = extractConnectOptions(packet);
  // Limit session Expiry Interval to server maximum
  connectOpts.sessionExpiryInterval = Math.min(
    connectOpts.sessionExpiryInterval || 0,
    cfg.maxSessionExpiryInterval,
  );
  connectOpts.keepAlive = packet.keepAlive;
  connectOpts.assignedClientIdentifier = assignedClientIdentifier;

  // Validate Packet & Authenticate Client
  const validationError = await validateConnectPacket(
    ctx,
    packet,
    connectOpts.sessionExpiryInterval,
  );
  const authResult = validationError ??
    await authenticateClient(ctx, clientId, packet);
  const { reasonCode, reasonString, authData } = authResult;
  const requireAuth = reasonCode === ReasonCode.continueAuthentication;

  ctx.prepareConnect(packet, clientId, connectOpts);
  if (isProtocolV5 && requireAuth) {
    const authMethod = packet.properties?.authenticationMethod;
    await ctx.send({
      type: PacketType.auth,
      protocolLevel: 5,
      reasonCode,
      properties: {
        authenticationMethod: authMethod,
        authenticationData: authData,
      },
    });
    return;
  }

  await completeConnect(
    ctx,
    packet.protocolLevel || 4,
    reasonCode,
    reasonString,
  );
}
