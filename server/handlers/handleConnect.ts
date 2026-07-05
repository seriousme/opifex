import type { Context } from "../context.ts";
import { AuthenticationResult, logger, PacketType, Timer } from "../deps.ts";
import type { ConnectPacket, TAuthenticationResult } from "../deps.ts";

/**
 * Checks if the client is authenticated based on the provided credentials
 * @param ctx - The connection context
 * @param packet - The MQTT CONNECT packet
 * @returns Authentication result indicating if the client is authenticated
 */
function isAuthenticated(
  ctx: Context,
  packet: ConnectPacket,
): TAuthenticationResult {
  if (ctx.handlers.isAuthenticated) {
    return ctx.handlers.isAuthenticated(
      ctx,
      packet.clientId || "",
      packet.username || "",
      packet.password || new Uint8Array(0),
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
function validateConnect(
  ctx: Context,
  packet: ConnectPacket,
): TAuthenticationResult {
  if (packet.protocolLevel !== 4) {
    return AuthenticationResult.unacceptableProtocol;
  }

  return isAuthenticated(ctx, packet);
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

/**
 * Handles the MQTT CONNECT packet
 * @param ctx - The connection context
 * @param packet - The MQTT CONNECT packet to handle
 */
export async function handleConnect(
  ctx: Context,
  packet: ConnectPacket,
): Promise<void> {
  const clientId = packet.clientId || `Opifex-${crypto.randomUUID()}`;
  const returnCode = validateConnect(ctx, packet);
  const sessionPresent = await processValidatedConnect(
    returnCode,
    packet,
    ctx,
    clientId,
  );
  await ctx.send({
    type: PacketType.connack,
    protocolLevel: ctx.protocolLevel,
    sessionPresent,
    returnCode,
  });
  logger.debug("connect returnCode", returnCode);
  if (returnCode !== AuthenticationResult.ok) {
    ctx.close();
    return;
  }
  if (sessionPresent) {
    await ctx.handleRedelivery();
  }
}
