import { type Context, SysPrefix } from "../context.ts";
import { PacketType, type PublishPacket, type Topic } from "../deps.ts";

/**
 * Checks if a client is authorized to publish to a given topic
 * @param ctx - The connection context
 * @param topic - The topic to check authorization for
 * @returns boolean indicating if client is authorized to publish
 */
function authorizedToPublish(ctx: Context, topic: Topic) {
  if (topic.startsWith(SysPrefix)) {
    return false;
  }
  if (ctx.handlers.isAuthorizedToPublish) {
    return ctx.handlers.isAuthorizedToPublish(ctx, topic);
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
  if (!authorizedToPublish(ctx, packet.topic)) {
    return;
  }

  const qos = packet.qos || 0;
  if (qos === 0) {
    ctx.persistence.publish(packet.topic, packet);
    return;
  }

  if (packet.id !== undefined) {
    // qos 1
    if (qos === 1) {
      const id = packet.id; // retain the id
      ctx.persistence.publish(packet.topic, packet);
      await ctx.send({
        type: PacketType.puback,
        id,
      });
      return;
    }
    // qos 2
    if (ctx.store) {
      ctx.store.pendingIncoming.set(packet.id, packet);
      await ctx.send({
        type: PacketType.pubrec,
        id: packet.id,
      });
    }
  }
}
