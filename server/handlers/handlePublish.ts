import { SysPrefix } from "../context.ts";
import {
  invalidmaxTopicLevels,
  invalidTopic,
  PacketType,
  ReasonCode,
} from "../deps.ts";
import type { Context } from "../context.ts";
import type {
  ExtPublishPacket,
  PacketId,
  QoS,
  Topic,
  TReasonCode,
} from "../deps.ts";

const reasonsToDisconnect: TReasonCode[] = [
  ReasonCode.topicAliasInvalid,
];

async function handlePublishError(
  ctx: Context,
  id: PacketId | undefined,
  qos: QoS,
  reasonCode: TReasonCode,
  reasonString: string,
) {
  // in v4 we can only close the connection
  if (ctx.protocolLevel === 4) {
    // in V4 we can only close the connection
    await ctx.close(false);
    return;
  }
  // in v5 we can message the client
  //
  const cfg = ctx.config.context;
  const addReasonString = cfg.provideReasonStrings === true;
  const properties = (reasonString && addReasonString) ? { reasonString } : {};

  if (reasonsToDisconnect.includes(reasonCode)) {
    await ctx.send({
      type: PacketType.disconnect,
      protocolLevel: ctx.protocolLevel,
      reasonCode,
      properties,
    });
    await ctx.close(false);
    return;
  }

  if (qos === 0) {
    // no message for QoS 0
    return;
  }
  // QoS 1 and 2 get a nice message

  const pType = qos === 1 ? PacketType.puback : PacketType.pubrec;
  await ctx.send({
    type: pType,
    protocolLevel: ctx.protocolLevel,
    id,
    reasonCode,
    properties,
  });
  return;
}

/**
 * Checks if a client is authorized to publish to a given topic
 * @param ctx - The connection context
 * @param topic - The topic to check authorization for
 * @returns boolean indicating if client is authorized to publish
 */
async function authorizedToPublish(ctx: Context, topic: Topic) {
  if (topic.startsWith(SysPrefix) && !ctx.isBroker) {
    return false;
  }
  if (ctx.handlers.isAuthorizedToPublish) {
    return await ctx.handlers.isAuthorizedToPublish(ctx, topic);
  }
  return true;
}

/**
 * Validates incoming PUBLISH packet rules prior to processing.
 * Returns an error object if invalid, or null if valid.
 */
function validatePublishPacket(
  ctx: Context,
  packet: ExtPublishPacket,
): { reasonCode: TReasonCode; message: string } | null {
  const cfg = ctx.config.context;
  const isProtocolV5 = packet.protocolLevel === 5;
  const hasTopicAlias = isProtocolV5 &&
    packet.properties?.topicAlias !== undefined;

  if (!cfg.retainAvailable && packet.retain) {
    return {
      reasonCode: ReasonCode.unspecifiedError,
      message: "Server does not support retain",
    };
  }

  const isInvalidTopic = (packet.topic.length === 0 && !hasTopicAlias) ||
    invalidTopic(packet.topic) ||
    invalidmaxTopicLevels(packet.topic, cfg.maxTopicLevels);

  if (isInvalidTopic) {
    return {
      reasonCode: ReasonCode.topicNameInvalid,
      message: "Invalid topic name",
    };
  }

  if (hasTopicAlias) {
    const topicAlias = packet.properties?.topicAlias;
    const aliasedTopic = ctx.incomingTopicAliases.get(topicAlias!);
    if (
      (topicAlias === 0 || topicAlias! > cfg.topicAliasMaximum) ||
      (packet.topic === "" && aliasedTopic === undefined)
    ) {
      return {
        reasonCode: ReasonCode.topicAliasInvalid,
        message: "Invalid topic alias",
      };
    }
    if (packet.topic !== "") {
      ctx.incomingTopicAliases.set(topicAlias!, packet.topic);
    } else {
      packet.topic = aliasedTopic!;
    }
  }

  return null;
}

/**
 * Handles MQTT PUBLISH packets
 * @param ctx - The connection context
 * @param packet - The PUBLISH packet to process
 * @returns Promise that resolves when packet is processed
 * @throws Error if packet processing fails
 */
export async function handlePublish(
  ctx: Context,
  packet: ExtPublishPacket,
): Promise<void> {
  const qos = packet.qos || 0;
  const id = packet.id;

  const validationError = validatePublishPacket(ctx, packet);
  if (validationError) {
    return await handlePublishError(
      ctx,
      id,
      qos,
      validationError.reasonCode,
      validationError.message,
    );
  }

  if (!await authorizedToPublish(ctx, packet.topic)) {
    await handlePublishError(
      ctx,
      id,
      qos,
      ReasonCode.notAuthorized,
      `Client not authorized to publish to ${packet.topic}`,
    );
    return;
  }

  if (
    (packet.protocolLevel === 5) && packet.properties?.messageExpiryInterval
  ) {
    packet.expiresAtMs = Date.now() +
      packet.properties.messageExpiryInterval * 1000;
  }
  if (qos === 0) {
    await ctx.publish(packet);
    return;
  }

  // qos 1
  if (qos === 1) {
    // publish the packet
    await ctx.publish(packet);
    // send the pubAck
    await ctx.send({
      type: PacketType.puback,
      protocolLevel: ctx.protocolLevel,
      id: id!,
    });
    return;
  }

  /*
In the QoS 2 delivery protocol, the Receiver

- MUST respond with a PUBREC containing the Packet Identifier from the incoming PUBLISH Packet,
having accepted ownership of the Application Message.
- Until it has received the corresponding PUBREL packet, the Receiver MUST acknowledge any subsequent
PUBLISH packet with the same Packet Identifier by sending a PUBREC. It MUST NOT cause duplicate
messages to be delivered to any onward recipients in this case.
- MUST respond to a PUBREL packet by sending a PUBCOMP packet containing the same Packet Identifier as the PUBREL.
- After it has sent a PUBCOMP, the receiver MUST treat any subsequent PUBLISH packet that contains that Packet
Identifier as being a new publication.
[MQTT-4.3.3-2].
    */

  // we take responsibility for the packet
  await ctx.persistence.addPendingIncomingPacket(ctx.clientId!, packet);
  await ctx.send({
    type: PacketType.pubrec,
    protocolLevel: ctx.protocolLevel,
    id: id!,
  });
}
