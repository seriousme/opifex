import {
  joinTopicFilter,
  PacketType,
  parseTopicFilter,
  ReasonCode,
} from "../deps.ts";
import type { UnsubscribePacket } from "../deps.ts";
import { SessionState } from "../context.ts";
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
  // this is v5 only, no unsubscriptions while reauthenticating
  const isAuthenticating = ctx.state === SessionState.authenticating;

  const subscriptions = new Set();
  for await (const sub of ctx.persistence.listSubscriptions(ctx.clientId!)) {
    subscriptions.add(joinTopicFilter(sub.topicFilter, sub.shareName));
  }

  const reasonCodes: ReasonCode[] = [];

  for (const packetTopicFilter of packet.topicFilters) {
    // split topicFilter into topicFilter and shareName
    const { topicFilter, shareName } = parseTopicFilter(
      packetTopicFilter,
    );
    if (subscriptions.has(packetTopicFilter) && !isAuthenticating) {
      reasonCodes.push(ReasonCode.success);
      await ctx.persistence.unsubscribe(ctx.clientId!, topicFilter, shareName);
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
