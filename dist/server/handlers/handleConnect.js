import { AuthenticationResult, logger, PacketType, Timer, } from "../deps.js";
/**
 * Checks if the client is authenticated based on the provided credentials
 * @param ctx - The connection context
 * @param packet - The MQTT CONNECT packet
 * @returns Authentication result indicating if the client is authenticated
 */
function isAuthenticated(ctx, packet) {
    if (ctx.handlers.isAuthenticated) {
        return ctx.handlers.isAuthenticated(ctx, packet.clientId || "", packet.username || "", packet.password || new Uint8Array(0));
    }
    return AuthenticationResult.ok;
}
/**
 * Validates the CONNECT packet
 * @param ctx - The connection context
 * @param packet - The MQTT CONNECT packet to validate
 * @returns Authentication result indicating if the CONNECT packet is valid
 */
function validateConnect(ctx, packet) {
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
function processValidatedConnect(packet, ctx, clientId) {
    if (packet.will) {
        ctx.will = {
            type: PacketType.publish,
            qos: packet.will.qos,
            retain: packet.will.retain,
            topic: packet.will.topic,
            payload: packet.will.payload,
        };
    }
    ctx.connect(clientId, packet.clean || false);
    const keepAlive = packet.keepAlive || 0;
    if (keepAlive > 0) {
        logger.debug(`Setting keepalive to ${keepAlive * 1500} ms`);
        ctx.timer = new Timer(() => {
            ctx.close();
        }, Math.floor(keepAlive * 1500));
    }
}
/**
 * Handles the MQTT CONNECT packet
 * @param ctx - The connection context
 * @param packet - The MQTT CONNECT packet to handle
 */
export function handleConnect(ctx, packet) {
    const clientId = packet.clientId || `Opifex-${crypto.randomUUID()}`;
    const returnCode = validateConnect(ctx, packet);
    if (returnCode === AuthenticationResult.ok) {
        processValidatedConnect(packet, ctx, clientId);
    }
    const sessionPresent = false;
    ctx.send({
        type: PacketType.connack,
        sessionPresent,
        returnCode,
    });
    if (returnCode !== AuthenticationResult.ok) {
        ctx.close();
    }
}
