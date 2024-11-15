import { PacketType } from "../deps.js";
export async function handleUnsubscribe(ctx, packet) {
    for (const topic of packet.topicFilters) {
        if (ctx.store) {
            ctx.persistence.unsubscribe(ctx.store, topic);
        }
    }
    await ctx.send({
        type: PacketType.unsuback,
        id: packet.id,
    });
}
