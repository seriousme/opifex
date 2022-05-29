import { Context } from "../context.ts";
import { UnsubackPacket } from "../deps.ts";

// The UNSUBACK Packet is sent by the Server to the Client to confirm receipt 
// of an UNSUBSCRIBE Packet.

export async function handleUnsuback(
  ctx: Context,
  packet: UnsubackPacket,
): Promise<void> {
  const id = packet.id;
  ctx.store.pendingOutgoing.delete(id);
  ctx.receiveUnsuback(id);
}
