import { PacketType } from "../deps.ts";
import type { PubrecPacket } from "../deps.ts";
import type { Context } from "../context.ts";

/**
 * Handles PUBREC (QoS 2 Publish Received) packets
 * @param ctx - The connection context
 * @param packet - The PUBREC packet received from the client
 * @returns Promise that resolves when handling is complete
 * @description
 * For QoS 2 message flow:
 * 1. Discards the original publish message
 * 2. Stores that PUBREC was received for the packet ID
 * 3. Sends PUBREL packet in response
 */
export async function handlePubrec(
  ctx: Context,
  packet: PubrecPacket,
): Promise<void> {
  const id = packet.id;
  if (ctx.store?.pendingOutgoing.has(id)) {
    ctx.store.pendingOutgoing.delete(id);
    ctx.store.pendingAckOutgoing.add(id);
    await ctx.send({
      type: PacketType.pubrel,
      protocolLevel: ctx.protocolLevel,
      id,
    });
  }
}
