import type { Context } from "../context.ts";
import type { PubackPacket } from "../deps.ts";

/**
 * Handles PUBACK (Publish Acknowledgment) packets in MQTT protocol
 * @param ctx - The connection context containing the client's state and configuration
 * @param packet - The PUBACK packet received from the client
 * @description
 * PUBACK packets are sent in response to PUBLISH packets with QoS level 1.
 */
export async function handlePuback(
  ctx: Context,
  packet: PubackPacket,
): Promise<void> {
  await ctx.processAck(packet.id);
}
