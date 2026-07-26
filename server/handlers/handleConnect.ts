import type { Context, IsAuthenticatedResult } from "../context.ts";
import {
  AuthenticationResult,
  logger,
  PacketType,
  ReasonCode,
  Timer,
} from "../deps.ts";
import type { ConnackProperties, ConnectPacket, TReasonCode } from "../deps.ts";

const MAX_EXPIRY = 0xFFFFFFFF;

function buildProps(ctx: Context, opts: {
  assignedClientIdentifier: string | undefined;
  reasonString: string | undefined;
  sessionExpiryInterval: number | undefined;
}): ConnackProperties {
  const cfg = ctx.config.context;
  const props: Partial<ConnackProperties> = {};
  if (opts.assignedClientIdentifier !== undefined) {
    props.assignedClientIdentifier = opts.assignedClientIdentifier;
  }
  if (opts.sessionExpiryInterval !== undefined) {
    props.sessionExpiryInterval = opts.sessionExpiryInterval;
  }
  if (opts.reasonString !== undefined && cfg.provideReasonStrings) {
    props.reasonString = opts.reasonString;
  }

  return {
    receiveMaximum: cfg.receiveMaximum,
    maximumQos: cfg.maximumQos,
    retainAvailable: cfg.retainAvailable,
    maximumPacketSize: cfg.maximumIncomingPacketSize,
    topicAliasMaximum: cfg.topicAliasMaximum,
    // reasonString: "reason",
    wildcardSubscriptionAvailable: cfg.wildcardSubscriptionAvailable,
    subscriptionIdentifierAvailable: cfg.subscriptionIdentifierAvailable,
    sharedSubscriptionAvailable: cfg.sharedSubscriptionAvailable,
    serverKeepAlive: cfg.serverKeepAlive,
    ...props,
    // responseInformation: "blah",
    // serverReference: "xyz",
    // authenticationMethod: "xyz",
    // authenticationData: Uint8Array.from([1,2,3]),
  };
}

/**
 * Checks if the client is authenticated based on the provided credentials
 * @param ctx - The connection context
 * @param packet - The MQTT CONNECT packet
 * @returns Authentication result indicating if the client is authenticated
 */
async function isAuthenticated(
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
 * Validates the CONNECT packet
 * @param ctx - The connection context
 * @param packet - The MQTT CONNECT packet to validate
 * @returns Authentication result indicating if the CONNECT packet is valid
 */

async function validateConnect(
  ctx: Context,
  packet: ConnectPacket,
  sessionExpiryInterval: number | undefined,
): Promise<{ reasonCode: TReasonCode; reasonString?: string }> {
  const cfg = ctx.config.context;
  if (!cfg.protocols.includes(packet.protocolLevel)) {
    return {
      reasonCode: ReasonCode.unsupportedProtocolVersion,
      reasonString: `Protocol version ${packet.protocolLevel} is not supported`,
    };
  }
  if (packet.will) {
    const isProtocolV5 = packet.protocolLevel === 5;
    const pkt = packet.will;
    if (!cfg.retainAvailable && pkt.retain) {
      return {
        reasonCode: ReasonCode.retainNotSupported,
        reasonString: `Client not authorized to publish will to ${pkt.topic}`,
      };
    }
    if (!ctx.handlers.isAuthorizedToPublish) {
      return {
        reasonCode: ReasonCode.notAuthorized,
        reasonString: `Client not authorized to publish will to ${pkt.topic}`,
      };
    }
    const qos = pkt.qos || 0;
    if (qos > cfg.maximumQos) {
      return {
        reasonCode: ReasonCode.qosNotSupported,
        reasonString: `Server does not support publish will with QoS ${qos} `,
      };
    }
    if (isProtocolV5) {
      const requestedInterval = packet.will.properties?.willDelayInterval || 0;
      if (requestedInterval > (sessionExpiryInterval || 0)) {
        return {
          reasonCode: ReasonCode.payloadFormatInvalid,
          reasonString:
            `Will delay interval larger than allowed session expiry interval`,
        };
      }
    }
  }

  return await isAuthenticated(ctx, packet);
}

/**
 * Processes the validated CONNECT packet
 * @param packet - The MQTT CONNECT packet
 * @param ctx - The connection context
 * @param clientId - The client ID
 */
async function processValidatedConnect(
  ctx: Context,
  packet: ConnectPacket,
  reasonCode: TReasonCode,
  clientId: string,
  sessionExpiryInterval: number | undefined,
): Promise<boolean> {
  if (reasonCode === ReasonCode.success) {
    if (packet.will) {
      ctx.will = {
        type: PacketType.publish,
        protocolLevel: ctx.protocolLevel,
        ...packet.will, //need to refine this to publish props only
      };
    }
    const existingSession = await ctx.connect(clientId, packet.clean || false);
    logger.debug(
      `Client has ${existingSession ? "an" : "no"} existing session`,
    );
    ctx.protocolLevel = packet.protocolLevel;
    if (ctx.mqttConn) {
      logger.debug(`Setting protocolLevel to ${ctx.protocolLevel}`);
      ctx.mqttConn.codecOpts.protocolLevel = ctx.protocolLevel;
    }
    const cfg = ctx.config.context;
    const isProtocolV5 = packet.protocolLevel === 5;
    const serverKeepAlive = cfg.serverKeepAlive;

    let keepAlive = packet.keepAlive || 0;
    if (isProtocolV5 && serverKeepAlive !== undefined) {
      // in V5 the server can force the keepalive [MQTT-3.2.2-21].
      keepAlive = serverKeepAlive;
    }
    if (keepAlive > 0) {
      logger.debug(`Setting keepalive to ${keepAlive * 1500} ms`);
      ctx.timer = new Timer(() => {
        ctx.close();
      }, keepAlive * 1500);
    }

    if (isProtocolV5 && sessionExpiryInterval) {
      ctx.sessionEndsTimer = new Timer(() => {
        ctx.close(false);
      }, sessionExpiryInterval * 1500);
    }
    return existingSession;
  }
  return false;
}

function reasonToReturnCode(reasonCode: number): number {
  switch (reasonCode) {
    case ReasonCode.success:
      return AuthenticationResult.ok; // 0x00 -> 0x00

    case ReasonCode.unsupportedProtocolVersion:
      return AuthenticationResult.unacceptableProtocol; // 0x84 -> 0x01

    case ReasonCode.clientIdentifierNotValid:
      return AuthenticationResult.rejectedUsername; // 0x85 -> 0x02

    case ReasonCode.badUserNameOrPassword:
    case ReasonCode.badAuthenticationMethod:
      return AuthenticationResult.badUsernameOrPassword; // 0x86 / 0x8E -> 0x04

    case ReasonCode.notAuthorized:
    case ReasonCode.banned:
      return AuthenticationResult.notAuthorized;

      // Fall back for any other ReasonCodes (0x80+)
      // 0x87 / 0x8C -> 0x05
    default:
      return AuthenticationResult.serverUnavailable; // Default fallback -> 0x03
  }
}

/**
 * Handles the MQTT CONNECT packet
 * @param ctx - The connection context
 * @param packet - The MQTT CONNECT packet to handle
 */
export async function handleConnect(
  ctx: Context,
  packet: ConnectPacket,
): Promise<void> {
  const isProtocolV5 = packet.protocolLevel === 5;
  let clientId = packet.clientId;
  let assignedClientIdentifier: string | undefined;
  let sessionExpiryInterval;
  if (!clientId) {
    assignedClientIdentifier = `Opifex-${crypto.randomUUID()}`;
    clientId = assignedClientIdentifier;
  }
  if (isProtocolV5) {
    const requestedInterval = packet.properties?.sessionExpiryInterval || 0;
    const maxInterval = ctx.config.context.maxSessionExpiryInterval ||
      MAX_EXPIRY;
    sessionExpiryInterval = requestedInterval > maxInterval
      ? maxInterval
      : requestedInterval;
  }
  const { reasonCode, reasonString } = await validateConnect(
    ctx,
    packet,
    sessionExpiryInterval,
  );
  const sessionPresent = await processValidatedConnect(
    ctx,
    packet,
    reasonCode,
    clientId,
    sessionExpiryInterval,
  );

  await ctx.send({
    type: PacketType.connack,
    protocolLevel: ctx.protocolLevel,
    sessionPresent,
    ...(isProtocolV5
      ? {
        reasonCode,
        properties: buildProps(ctx, {
          assignedClientIdentifier,
          reasonString,
          sessionExpiryInterval,
        }),
      }
      : { returnCode: reasonToReturnCode(reasonCode) }),
  });
  logger.debug("connect reasonCode", reasonCode);
  if (reasonCode !== ReasonCode.success) {
    await ctx.close(false);
    return;
  }
  if (sessionPresent) {
    await ctx.handleRedelivery();
  }
}
