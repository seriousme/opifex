import type { Context } from "../context.ts";
import type { PubackPacket } from "../deps.ts";

/**
 * Handles PUBACK (Publish Acknowledgment) packets in MQTT protocol
 * @param ctx - The connection context containing the client's state and configuration
 * @param packet - The PUBACK packet received from the client
 * @description
 * PUBACK packets are sent in response to PUBLISH packets with QoS level 1.
 * This function removes the original PUBLISH packet from the pending outgoing messages store
 * once acknowledgment is received.
 */
export function handlePuback(ctx: Context, packet: PubackPacket) {
  // qos 1 only
  const id = packet.id;
  if (ctx.store?.pendingOutgoing.has(id)) {
    ctx.store.pendingOutgoing.delete(id);
  }
}
