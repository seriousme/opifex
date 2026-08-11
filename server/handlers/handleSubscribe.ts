import type { Context } from "../context.ts";
import {
  hasWildcards,
  invalidmaxTopicLevels,
  invalidTopicFilter,
  PacketType,
  ReasonCode,
} from "../deps.ts";
import type {
  SubscribePacket,
  Subscription,
  SubscriptionV5,
  Topic,
  TReasonCode,
} from "../deps.ts";

// V4 Subscription Failure
const V4SubscriptionFailure = 0x80;
/**
 * Checks if a client is authorized to subscribe to a topic.
 */
async function authorizedToSubscribe(
  ctx: Context,
  topicFilter: Topic,
): Promise<boolean> {
  if (ctx.handlers.isAuthorizedToSubscribe) {
    return await ctx.handlers.isAuthorizedToSubscribe(ctx, topicFilter);
  }
  return true;
}

/**
 * Validates a single subscription topic filter against server configuration.
 * Returns an error ReasonCode if invalid, or null if valid.
 */
function validateSubscriptionTopic(
  sub: Subscription,
  cfg: Context["config"]["context"],
): TReasonCode | null {
  if (
    cfg.wildcardSubscriptionAvailable === false && hasWildcards(sub.topicFilter)
  ) {
    return ReasonCode.wildcardSubscriptionsNotSupported;
  }

  if (
    sub.topicFilter.length === 0 ||
    invalidTopicFilter(sub.topicFilter) ||
    invalidmaxTopicLevels(sub.topicFilter, cfg.maxTopicLevels)
  ) {
    return ReasonCode.topicFilterInvalid;
  }

  return null;
}

/**
 * Processes an MQTT SUBSCRIBE packet.
 * @remarks The order of return codes in the SUBACK Packet MUST match the order of Topic Filters in the SUBSCRIBE Packet [MQTT-3.9.3-1]
 */
export async function handleSubscribe(
  ctx: Context,
  packet: SubscribePacket,
): Promise<void> {
  const cfg = ctx.config.context;
  const isProtocolV5 = packet.protocolLevel === 5;

  const subscriptionIdentifier = isProtocolV5
    ? packet.properties?.subscriptionIdentifier
    : undefined;

  // Pre-fetch existing subscriptions to evaluate Retain Handling logic (retainHandling === 1)
  const existingTopicFilters = new Set<string>();
  for await (
    const existingSub of ctx.persistence.listSubscriptions(ctx.clientId!)
  ) {
    existingTopicFilters.add(existingSub.topicFilter);
  }

  const retainedSubscriptions: Subscription[] = [];
  const results: TReasonCode[] = [];

  for (const sub of packet.subscriptions) {
    // TopicFilter Validation
    const validationError = validateSubscriptionTopic(sub, cfg);
    if (validationError !== null) {
      if (!isProtocolV5) {
        await ctx.close(false);
        return;
      }
      results.push(validationError);
      continue;
    }

    // Authorization Check
    if (!await authorizedToSubscribe(ctx, sub.topicFilter)) {
      results.push(
        isProtocolV5 ? ReasonCode.notAuthorized : V4SubscriptionFailure,
      );
      continue;
    }

    // Register Subscription
    const subV5 = sub as Partial<SubscriptionV5>;
    const isNewSubscription = !existingTopicFilters.has(sub.topicFilter);

    await ctx.persistence.subscribe(
      ctx.clientId!,
      sub.topicFilter,
      sub.qos,
      subV5.noLocal,
      subV5.retainAsPublished,
      subV5.retainHandling,
      subscriptionIdentifier,
    );

    existingTopicFilters.add(sub.topicFilter);

    // Collect Subscriptions Requiring Retained Messages
    if (
      subV5.retainHandling !== 2 &&
      (subV5.retainHandling !== 1 || isNewSubscription)
    ) {
      retainedSubscriptions.push(sub);
    }

    // Success code (Granted QoS)
    results.push(sub.qos as TReasonCode);
  }

  // Send SUBACK response
  await ctx.send({
    type: PacketType.suback,
    protocolLevel: ctx.protocolLevel,
    id: packet.id,
    ...(isProtocolV5
      ? { reasonCodes: results }
      : { returnCodes: results as number[] }),
  });

  // Dispatch matching retained messages
  if (retainedSubscriptions.length > 0) {
    await ctx.persistence.handleRetained(ctx.clientId!, retainedSubscriptions);
  }
}
