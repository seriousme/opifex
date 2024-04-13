import type { Context } from "../context.ts";
import type { PubackPacket } from "../deps.ts";

// A PUBACK Packet is the response to a PUBLISH Packet with QoS level 1.

export function handlePuback(ctx: Context, packet: PubackPacket): void {
  const id = packet.id;
  ctx.store.pendingOutgoing.delete(id);
  ctx.receivePuback(id);
}
