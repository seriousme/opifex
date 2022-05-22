import { Context, SysPrefix } from "../context.ts";
import { PacketType, PublishPacket, Topic } from "../deps.ts";

function authorizedToPublish(ctx: Context, topic: Topic) {
  if (topic.startsWith(SysPrefix)) {
    return false;
  }
  if (ctx.handlers.isAuthorizedToPublish) {
    return ctx.handlers.isAuthorizedToPublish(ctx, topic);
  }
  return true;
}

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
      ctx.persistence.publish(packet.topic, packet);
      await ctx.send({
        type: PacketType.puback,
        id: packet.id,
      });
      return;
    }
    // qos 2
    if (ctx.client) {
      ctx.client.incomming.set(packet.id, packet);
      await ctx.send({
        type: PacketType.pubrec,
        id: packet.id,
      });
    }
  }
}
