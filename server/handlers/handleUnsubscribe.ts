import { PacketType, ReasonCode } from "../deps.ts";
import type { TReasonCode, UnsubscribePacket } from "../deps.ts";
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
  const subscriptions = new Set();
  for await (const sub of ctx.persistence.listSubscriptions(ctx.clientId!)) {
    subscriptions.add(sub.topicFilter);
  }

  const reasonCodes: TReasonCode[] = [];

  for (const topicFilter of packet.topicFilters) {
    if (subscriptions.has(topicFilter)) {
      reasonCodes.push(ReasonCode.success);
      await ctx.persistence.unsubscribe(ctx.clientId!, topicFilter);
    } else {
      reasonCodes.push(ReasonCode.noSubscriptionExisted);
    }
  }
  await ctx.send({
    type: PacketType.unsuback,
    id: packet.id,
    protocolLevel: ctx.protocolLevel,
    reasonCodes,
  });
}
