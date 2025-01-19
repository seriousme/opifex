import type { Context } from "../context.ts";
import type { PubcompPacket } from "../deps.ts";

/**
 * Handles PUBCOMP packets which are the response to PUBREL packets in QoS 2 flow
 * @param ctx - The connection context containing the client state and store
 * @param packet - The PUBCOMP packet received from the broker
 * @description
 * This function processes PUBCOMP packets which are the fourth and final packet
 * in the QoS 2 protocol exchange. It removes the message from pendingAckOutgoing queue
 * Completes the corresponding publish operation
 */
export function handlePubcomp(ctx: Context, packet: PubcompPacket): void {
  const id = packet.id;
  if (ctx.store.pendingAckOutgoing.has(id)) {
    ctx.store.pendingAckOutgoing.delete(id);
    ctx.receivePubcomp(id);
  }
}
