import type { Context } from "../context.ts";
import { PacketType, type UnsubscribePacket } from "../deps.ts";

export async function handleUnsubscribe(
  ctx: Context,
  packet: UnsubscribePacket,
): Promise<void> {
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
