import type { Context } from "../context.ts";
import { PacketType, ReasonCode } from "../deps.ts";
import type {
  SubscribePacket,
  Subscription,
  Topic,
  TReasonCode,
} from "../deps.ts";

/**
 * @constant {number} SubscriptionFailure
 * @description Code indicating a failed subscription attempt
 */
const SubscriptionFailure = 0x80;

/**
 * Checks if a client is authorized to subscribe to a topic
 * @param  ctx - The connection context
 * @param  topicFilter - The topic filter to check authorization for
 * @returns True if authorized, false otherwise
 */
async function authorizedToSubscribe(ctx: Context, topicFilter: Topic) {
  if (ctx.handlers.isAuthorizedToSubscribe) {
    return await ctx.handlers.isAuthorizedToSubscribe(ctx, topicFilter);
  }
  return true;
}

/**
 * @function handleSubscribe
 * @description Processes an MQTT SUBSCRIBE packet
 * @param {Context} ctx - The connection context
 * @param {SubscribePacket} packet - The SUBSCRIBE packet received from the client
 * @returns {Promise<void>}
 * @throws {Error} If subscription processing fails
 * @remarks The order of return codes in the SUBACK Packet MUST match the order of Topic Filters in the SUBSCRIBE Packet [MQTT-3.9.3-1]
 */
export async function handleSubscribe(
  ctx: Context,
  packet: SubscribePacket,
): Promise<void> {
  const isProtocolV4 = ctx.protocolLevel === 4;
  /*
   * The order of return codes in the SUBACK Packet MUST match the order of
   * Topic Filters in the SUBSCRIBE Packet [MQTT-3.9.3-1].
   */
  const validSubscriptions: Subscription[] = [];
  const results: number[] = [];
  for (const sub of packet.subscriptions) {
    if (!await authorizedToSubscribe(ctx, sub.topicFilter)) {
      // codes differ between v4 and v5
      results.push(
        isProtocolV4 ? SubscriptionFailure : ReasonCode.notAuthorized,
      );
      continue;
    }
    await ctx.persistence.subscribe(ctx.clientId!, sub.topicFilter, sub.qos);
    validSubscriptions.push(sub);
    // codes are identical between v4 and v5
    results.push(sub.qos);
  }

  await ctx.send({
    type: PacketType.suback,
    protocolLevel: ctx.protocolLevel,
    id: packet.id,
    ...(isProtocolV4
      ? { returnCodes: results }
      : { reasonCodes: results as TReasonCode[] }),
  });

  /*
   * send any retained messages that match these subscriptions
   */
  if (validSubscriptions.length > 0) {
    await ctx.persistence.handleRetained(ctx.clientId!, validSubscriptions);
  }
}
