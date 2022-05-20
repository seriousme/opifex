import { Context } from "../context.ts";
import { PubcompPacket } from "../deps.ts";

// qos 2 only
// Discard stored state

export async function handlePubcomp(
  ctx: Context,
  packet: PubcompPacket,
): Promise<void> {
  const id = packet.id;
  if (ctx.client?.pendingAckOutgoing.has(id)) {
    ctx.client.pendingAckOutgoing.delete(id);
  }
}
