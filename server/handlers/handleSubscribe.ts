import { SessionState } from "../context.ts";
import type { Context } from "../context.ts";
import {
  hasWildcards,
  invalidmaxTopicLevels,
  invalidTopicFilter,
  joinTopicFilter,
  logger,
  PacketType,
  parseTopicFilter,
  ReasonCode,
} from "../deps.ts";
import type {
  ClientSubscription,
  ShareName,
  SubscribePacket,
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
  shareName: ShareName,
): Promise<boolean> {
  if (ctx.state === SessionState.authenticating) {
    return false;
  }
  try {
    if (ctx.handlers.isAuthorizedToSubscribe) {
      return await ctx.handlers.isAuthorizedToSubscribe(
        ctx,
        topicFilter,
        shareName,
      );
    }
  } catch (err) {
    let message = "unknown error";
    if (err instanceof Error) {
      message = err.message;
    }
    logger.error("isAuthorizedToSubscribe failed with error", message);
    return false;
  }
  return true;
}

/**
 * Validates a single subscription topic filter against server configuration.
 * Returns an error ReasonCode if invalid, or null if valid.
 */
function validateSubscription(
  isProtocolV5: boolean,
  sub: ClientSubscription,
  cfg: Context["config"]["context"],
): TReasonCode | null {
  if (
    cfg.wildcardSubscriptionAvailable === false && hasWildcards(sub.topicFilter)
  ) {
    return ReasonCode.wildcardSubscriptionsNotSupported;
  }

  if (sub.shareName !== "") {
    if (cfg.sharedSubscriptionAvailable === false || !isProtocolV5) {
      return ReasonCode.sharedSubscriptionsNotSupported;
    }
    // noLocal is not allowed on shared subscriptions
    if (sub.noLocal) {
      return ReasonCode.topicFilterInvalid;
    }
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
  const existingTopicFilters = new Set();
  for await (const sub of ctx.persistence.listSubscriptions(ctx.clientId!)) {
    existingTopicFilters.add(joinTopicFilter(sub.topicFilter, sub.shareName));
  }

  const retainedSubscriptions: ClientSubscription[] = [];
  const results: TReasonCode[] = [];

  for (const sub of packet.subscriptions) {
    const clientSub = sub as ClientSubscription;
    // split topicFilter into topicFilter and shareName
    const { topicFilter, shareName } = parseTopicFilter(
      sub.topicFilter,
    );
    clientSub.topicFilter = topicFilter;
    clientSub.shareName = shareName;
    // TopicFilter Validation
    const validationError = validateSubscription(isProtocolV5, clientSub, cfg);
    if (validationError !== null) {
      if (!isProtocolV5) {
        await ctx.close(false);
        return;
      }
      results.push(validationError);
      continue;
    }

    // Authorization Check
    if (
      !await authorizedToSubscribe(
        ctx,
        clientSub.topicFilter,
        clientSub.shareName,
      )
    ) {
      results.push(
        isProtocolV5 ? ReasonCode.notAuthorized : V4SubscriptionFailure,
      );
      continue;
    }

    // Register Subscription
    const filterKey = sub.topicFilter;
    const isNewSubscription = !existingTopicFilters.has(filterKey);

    if (subscriptionIdentifier) {
      clientSub.subscriptionIdentifier = subscriptionIdentifier;
    }
    await ctx.persistence.subscribe(
      ctx.clientId!,
      clientSub,
    );

    existingTopicFilters.add(filterKey);

    // Collect Subscriptions Requiring Retained Messages
    if (
      clientSub.retainHandling !== 2 &&
      (clientSub.retainHandling !== 1 || isNewSubscription)
    ) {
      retainedSubscriptions.push(clientSub);
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
