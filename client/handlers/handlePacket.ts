import { ConnectionState, Context } from "../context.ts";
import { AnyPacket, PacketType } from "../deps.ts";
import { handleConnack } from "./handleConnack.ts";
import { handlePublish } from "./handlePublish.ts";
import { handlePuback } from "./handlePuback.ts";
import { handlePubrec } from "./handlePubrec.ts";
import { handlePubrel } from "./handlePubrel.ts";
import { handlePubcomp } from "./handlePubcomp.ts";
import { handleSuback } from "./handleSuback.ts";
import { handleUnsuback } from "./handleUnsuback.ts";
import { logger } from "../deps.ts";

export async function handlePacket(
	ctx: Context,
	packet: AnyPacket,
): Promise<void> {
	logger.debug({ received: JSON.stringify(packet, null, 2) });
	if (ctx.connectionState !== ConnectionState.connected) {
		if (packet.type === PacketType.connack) {
			handleConnack(packet, ctx);
		} else {
			throw new Error(
				`Received ${PacketType[packet.type]} packet before connect`,
			);
		}
	} else {
		switch (packet.type) {
			case PacketType.pingreq:
				break;
			case PacketType.publish:
				await handlePublish(ctx, packet);
				break;
			case PacketType.puback:
				await handlePuback(ctx, packet);
				break;
			case PacketType.pubrel:
				await handlePubrel(ctx, packet);
				break;
			case PacketType.pubrec:
				await handlePubrec(ctx, packet);
				break;
			case PacketType.pubcomp:
				await handlePubcomp(ctx, packet);
				break;
			case PacketType.suback:
				await handleSuback(ctx, packet);
				break;
			case PacketType.unsuback:
				handleUnsuback(ctx, packet);
				break;

			default:
				throw new Error(
					`Received unexpected ${PacketType[packet.type]} packet after connect`,
				);
		}
	}
}
