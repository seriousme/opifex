import { Context } from "../context.ts";
import {
	AuthenticationResult,
	ConnectPacket,
	logger,
	PacketType,
	Timer,
} from "../deps.ts";

function isAuthenticated(
	ctx: Context,
	packet: ConnectPacket,
): AuthenticationResult {
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

function validateConnect(
	ctx: Context,
	packet: ConnectPacket,
): AuthenticationResult {
	if (packet.protocolLevel !== 4) {
		return AuthenticationResult.unacceptableProtocol;
	}
	return isAuthenticated(ctx, packet);
}

export function handleConnect(ctx: Context, packet: ConnectPacket): void {
	const clientId = packet.clientId || `Opifex-${crypto.randomUUID()}`;
	const returnCode = validateConnect(ctx, packet);
	// connect is ok
	if (returnCode === AuthenticationResult.ok) {
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
