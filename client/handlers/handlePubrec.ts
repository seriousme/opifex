import type { Context } from "../context.ts";
import { PacketType } from "../deps.ts";
import type { PubrecPacket, PubrelPacket } from "../deps.ts";

/**
 * Handles PUBREC (Publish Received) packets for QoS 2 message flow
 * It is the second packet of the QoS 2 protocol exchange.
 * @param ctx - The connection context containing message stores and send function
 * @param packet - The received PUBREC packet
 * @description
 * When a PUBREC packet is received:
 * 1. Checks if there is a pending outgoing message with matching packet ID
 * 2. Creates a PUBREL packet to acknowledge the PUBREC
 * 3. Add the packet ID to pendingAckOutgoing store
 * 4. Removes the message from pendingOutgoing store
 * 5. Sends the PUBREL packet
 */
export async function handlePubrec(
  ctx: Context,
  packet: PubrecPacket,
): Promise<void> {
  const id = packet.id;
  const ack: PubrelPacket = {
    type: PacketType.pubrel,
    protocolLevel: ctx.protocolLevel,
    id,
  };
  if (ctx.store.pendingOutgoing.has(id)) {
    ctx.store.pendingAckOutgoing.set(id, ack);
    ctx.store.pendingOutgoing.delete(id);
    await ctx.send(ack);
  }
}
