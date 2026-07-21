import { SysPrefix } from "../context.ts";
import { PacketType, ReasonCode } from "../deps.ts";
import type { Context } from "../context.ts";
import type {
  PacketId,
  PublishPacket,
  QoS,
  Topic,
  TReasonCode,
} from "../deps.ts";

async function handlePublishError(
  ctx: Context,
  id: PacketId | undefined,
  topic: Topic,
  qos: QoS,
  reasonCode: TReasonCode,
) {
  // in v4 we can only close the connection
  if (ctx.protocolLevel === 4) {
    // in V4 we can only close the connection
    await ctx.close();
    return;
  }
  // in v5 we can message the client
  if (qos === 0) {
    // no message for QoS 0
    return;
  }
  // QoS 1 and 2 get a nice message
  let reasonString = "";
  if (reasonCode === ReasonCode.notAuthorized) {
    reasonString = `Client not authorized to publish to ${topic}`;
  }
  if (reasonCode === ReasonCode.retainNotSupported) {
    reasonString = `Server does not support retain`;
  }
  const properties = reasonString ? { reasonString } : {};
  const pType = qos === 1 ? PacketType.puback : PacketType.pubrec;
  await ctx.send({
    type: pType,
    protocolLevel: ctx.protocolLevel,
    id,
    reasonCode: reasonCode,
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
 * Handles MQTT PUBLISH packets
 * @param ctx - The connection context
 * @param packet - The PUBLISH packet to process
 * @returns Promise that resolves when packet is processed
 * @throws Error if packet processing fails
 */
export async function handlePublish(
  ctx: Context,
  packet: PublishPacket,
): Promise<void> {
  const qos = packet.qos || 0;
  const id = packet.id;

  if (!ctx.config.context.retainAvailable && packet.retain) {
    await handlePublishError(
      ctx,
      id,
      packet.topic,
      qos,
      ReasonCode.retainNotSupported,
    );
  }

  if (!await authorizedToPublish(ctx, packet.topic)) {
    await handlePublishError(
      ctx,
      id,
      packet.topic,
      qos,
      ReasonCode.notAuthorized,
    );
    return;
  }

  if (qos === 0) {
    await ctx.publish(packet);
    return;
  }

  if (id !== undefined) {
    // qos 1
    if (qos === 1) {
      // publish the packet
      await ctx.publish(packet);
      // send the pubAck
      await ctx.send({
        type: PacketType.puback,
        protocolLevel: ctx.protocolLevel,
        id,
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
      id,
    });
  }
}
