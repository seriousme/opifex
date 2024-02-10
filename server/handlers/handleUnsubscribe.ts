import { Context } from "../context.ts";
import { PacketType, UnsubscribePacket } from "../deps.ts";

export async function handleUnsubscribe(
	ctx: Context,
	packet: UnsubscribePacket,
): Promise<void> {
	packet.topicFilters.forEach((topic) => {
		if (ctx.store) {
			ctx.persistence.unsubscribe(ctx.store, topic);
		}
	});
	await ctx.send({
		type: PacketType.unsuback,
		id: packet.id,
	});
}
