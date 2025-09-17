import type { Context } from "../context.ts";
import type { SubackPacket } from "../deps.ts";

/**
 * Handles SUBACK packets received from the server
 * @param ctx - The MQTT client context
 * @param packet - The SUBACK packet containing subscription confirmations
 * @description
 * - Processes SUBACK packets sent by server to confirm SUBSCRIBE requests
 * - Removes the packet ID from pending outgoing messages
 * - Notifies the client about granted QoS levels for each subscription
 */
export function handleSuback(ctx: Context, packet: SubackPacket): void {
  const id = packet.id;
  ctx.store.pendingOutgoing.delete(id);
  if (packet.protocolLevel !== 5) {
    ctx.receiveSuback(id, packet.returnCodes);
  }
}
