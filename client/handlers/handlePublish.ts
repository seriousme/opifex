import type { Context } from "../context.ts";
import { PacketType, type PublishPacket } from "../deps.ts";

/**
 * Handles incoming MQTT publish packets based on their QoS level
 * @param ctx - The MQTT connection context
 * @param packet - The incoming publish packet to handle
 * @returns Promise that resolves when packet is handled
 */
export async function handlePublish(ctx: Context, packet: PublishPacket) {
  const qos = packet.qos || 0;
  if (qos === 0) {
    ctx.receivePublish(packet);
    return;
  }

  if (packet.id !== undefined) {
    // qos 1
    if (qos === 1) {
      ctx.receivePublish(packet);
      await ctx.send({
        type: PacketType.puback,
        id: packet.id,
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
