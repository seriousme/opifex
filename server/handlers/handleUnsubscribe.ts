import { PacketType } from "../deps.ts";
import type { UnsubscribePacket } from "../deps.ts";
import type { Context } from "../context.ts";

/**
 * Handles MQTT unsubscribe packets by removing subscriptions and sending acknowledgement
 * @param ctx - The connection context containing client information and methods
 * @param packet - The MQTT unsubscribe packet containing topics to unsubscribe from
 * @returns Promise that resolves when unsubscribe is complete and acknowledged
 */
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
    protocolLevel: ctx.protocolLevel,
  });
}
