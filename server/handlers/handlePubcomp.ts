import type { Context } from "../context.ts";
import type { PubcompPacket } from "../deps.ts";

/**
 * Handles PUBCOMP packets which are the response to PUBREL packets in QoS 2 flow
 * @param ctx - The connection context containing the client state and configuration
 * @param packet - The PUBCOMP packet received from the client
 * @description
 * This is the fourth and final packet of the QoS 2 protocol exchange.
 * When received, it removes the message from the pendingAckOutgoing store.
 */
export async function handlePubcomp(
  ctx: Context,
  packet: PubcompPacket,
): Promise<void> {
  const id = packet.id;
  await ctx.persistence.deletePendingAck(ctx.clientId!, id);
}
