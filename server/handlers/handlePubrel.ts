import { PacketType } from "../deps.ts";
import type { Context } from "../context.ts";
import type { PubrelPacket } from "../deps.ts";

/**
 * Handles PUBREL (QoS 2 publish release) packets
 *
 * @param ctx - The connection context
 * @param packet - The PUBREL packet received from the client
 * @returns Promise that resolves when handling is complete
 * @description
 * For QoS 2 message delivery:
 * 1. Initiates onward delivery of the Application Message
 * 2. Discards the stored message
 * 3. Sends PUBCOMP packet with the Packet Identifier
 */
export async function handlePubrel(
  ctx: Context,
  packet: PubrelPacket,
): Promise<void> {
  const id = packet.id;
  if (ctx.store?.pendingIncoming.has(id)) {
    const storedPacket = ctx.store.pendingIncoming.get(id);
    if (storedPacket) {
      ctx.persistence.publish(storedPacket.topic, storedPacket);
      ctx.store.pendingIncoming.delete(id);
      await ctx.send({
        type: PacketType.pubcomp,
        id,
      });
    }
  }
}
