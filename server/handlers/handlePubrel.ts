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

  const storedPacket = await ctx.persistence.getPendingIncomingPacket(
    ctx.clientId!,
    id,
  );

  if (storedPacket) {
    // packet is in store
    // publish the packet
    await ctx.publish(storedPacket);
    await ctx.persistence.deletePendingIncomingPacket(ctx.clientId!, id);
  }

  await ctx.send({
    type: PacketType.pubcomp,
    protocolLevel: ctx.protocolLevel,
    id,
  });
}
