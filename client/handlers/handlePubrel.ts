import type { Context } from "../context.ts";
import { PacketType, type PubrelPacket } from "../deps.ts";

/**
 * Handles a PUBREL packet in the MQTT QoS 2 flow
 * It is the third packet of the QoS 2 protocol exchange
 * and a response to the PUBREC packet
 *
 * It uses Method A from the MQTT specification
 * @param ctx - The MQTT client context
 * @param packet - The PUBREL packet received
 * @description
 * When a PUBREL packet is received:
 * 1. If there is a matching pending incoming message:
 *    - Delivers the stored message to the application
 *    - Removes the message from pending incoming store
 *    - Sends PUBCOMP packet as acknowledgement
 * 2. If no matching message found, silently ignores
 */
export async function handlePubrel(
  ctx: Context,
  packet: PubrelPacket,
): Promise<void> {
  const id = packet.id;
  if (ctx.store.pendingIncoming.has(id)) {
    const storedPacket = ctx.store.pendingIncoming.get(id);
    if (storedPacket) {
      ctx.receivePublish(storedPacket);
      ctx.store.pendingIncoming.delete(id);
      await ctx.send({
        type: PacketType.pubcomp,
        id,
      });
    }
  }
}
