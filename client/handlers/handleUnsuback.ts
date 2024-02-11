import { Context } from "../context.ts";
import { UnsubackPacket } from "../deps.ts";

// The UNSUBACK Packet is sent by the Server to the Client to confirm receipt
// of an UNSUBSCRIBE Packet.

export function handleUnsuback(ctx: Context, packet: UnsubackPacket): void {
  const id = packet.id;
  ctx.store.pendingOutgoing.delete(id);
  ctx.receiveUnsuback(id);
}
