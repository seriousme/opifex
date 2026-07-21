import type { Context } from "../context.ts";
import { AuthenticationResult, logger, PacketType, Timer } from "../deps.ts";
import type {
  ConnackProperties,
  ConnectPacket,
  TAuthenticationResult,
} from "../deps.ts";

function buildProps(ctx: Context, opts: {
  assignedClientIdentifier: string | undefined;
}): ConnackProperties {
  const cfg = ctx.config.context;
  const props: Partial<ConnackProperties> = {};
  if (opts.assignedClientIdentifier !== undefined) {
    props.assignedClientIdentifier = opts.assignedClientIdentifier;
  }

  return {
    sessionExpiryInterval: cfg.sessionExpiryInterval,
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
): Promise<TAuthenticationResult> {
  if (ctx.handlers.isAuthenticated) {
    return await ctx.handlers.isAuthenticated(
      ctx,
      packet.clientId || "",
      packet.username || "",
      packet.password || new Uint8Array(0),
      packet,
    );
  }
  return AuthenticationResult.ok;
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
): Promise<TAuthenticationResult> {
  if (packet.protocolLevel !== 4 && packet.protocolLevel !== 5) {
    return AuthenticationResult.unacceptableProtocol;
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
  returnCode: TAuthenticationResult,
  packet: ConnectPacket,
  ctx: Context,
  clientId: string,
): Promise<boolean> {
  if (returnCode === AuthenticationResult.ok) {
    if (packet.will) {
      ctx.will = {
        type: PacketType.publish,
        protocolLevel: ctx.protocolLevel,
        qos: packet.will.qos,
        retain: packet.will.retain,
        topic: packet.will.topic,
        payload: packet.will.payload,
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

    const keepAlive = packet.keepAlive || 0;
    if (keepAlive > 0) {
      logger.debug(`Setting keepalive to ${keepAlive * 1500} ms`);
      ctx.timer = new Timer(() => {
        ctx.close();
      }, Math.floor(keepAlive * 1500));
    }
    return existingSession;
  }
  return false;
}

function reasonToReturnCode(reasonCode: number): number {
  // Direct overlap between V4 and V5
  if (reasonCode <= 0x05) {
    return reasonCode;
  }

  // Specific security/autorisation cases
  if (reasonCode === 0x87 || reasonCode === 0x8C) {
    return 0x05; // Not Authorized
  }

  // Client ID errors
  if (reasonCode === 0x85) { // Client Identifier not valid
    return 0x02; // Identifier Rejected
  }

  // Fall back for any other ReasonCodes (0x80+)
  return 0x03; // Server Unavailable
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
  let clientId = packet.clientId;
  let assignedClientIdentifier: string | undefined;

  if (!clientId) {
    assignedClientIdentifier = `Opifex-${crypto.randomUUID()}`;
    clientId = assignedClientIdentifier;
  }
  const reasonCode = await validateConnect(ctx, packet);
  const sessionPresent = await processValidatedConnect(
    reasonCode,
    packet,
    ctx,
    clientId,
  );
  const isProtocolV5 = packet.protocolLevel === 5;
  await ctx.send({
    type: PacketType.connack,
    protocolLevel: ctx.protocolLevel,
    sessionPresent,
    ...(isProtocolV5
      ? {
        reasonCode,
        properties: buildProps(ctx, { assignedClientIdentifier }),
      }
      : { returnCode: reasonToReturnCode(reasonCode) }),
  });
  logger.debug("connect reasonCode", reasonCode);
  if (reasonCode !== AuthenticationResult.ok) {
    await ctx.close(false);
    return;
  }
  if (sessionPresent) {
    await ctx.handleRedelivery();
  }
}
