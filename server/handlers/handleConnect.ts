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
  if (packet.bridgeMode === true) {
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
function processValidatedConnect(
  returnCode: TAuthenticationResult,
  packet: ConnectPacket,
  ctx: Context,
  clientId: string,
): boolean {
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

    ctx.connect(clientId, packet.clean || false);
    ctx.protocolLevel = packet.protocolLevel;
    if (ctx.mqttConn) {
      ctx.mqttConn.codecOpts.protocolLevel = ctx.protocolLevel;
    }

    const keepAlive = packet.keepAlive || 0;
    if (keepAlive > 0) {
      logger.debug(`Setting keepalive to ${keepAlive * 1500} ms`);
      ctx.timer = new Timer(() => {
        ctx.close();
      }, Math.floor(keepAlive * 1500));
    }
    // is this a new session?
    // either because its the first time for the client
    // or it specifically asked for a clean one
    const previousSession = ctx.store?.existingSession;
    // client now has a history
    if (!previousSession && ctx.store) {
      ctx.store.existingSession = true;
    }
    return previousSession || false;
  }
  return false;
}

/**
 * Handles the MQTT CONNECT packet
 * @param ctx - The connection context
 * @param packet - The MQTT CONNECT packet to handle
 */
export function handleConnect(ctx: Context, packet: ConnectPacket): void {
  const clientId = packet.clientId || `Opifex-${crypto.randomUUID()}`;
  const returnCode = validateConnect(ctx, packet);
  const sessionPresent = processValidatedConnect(
    returnCode,
    packet,
    ctx,
    clientId,
  );
  ctx.send({
    type: PacketType.connack,
    protocolLevel: ctx.protocolLevel,
    sessionPresent,
    returnCode,
  });

  if (returnCode !== AuthenticationResult.ok) {
    ctx.close();
  }
}
