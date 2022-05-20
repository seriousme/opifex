import { Context } from "../context.ts";
import { PubackPacket } from "../deps.ts";

export async function handlePuback(
  ctx: Context,
  packet: PubackPacket,
) {
  // qos 1 only
  const id = packet.id;
  if (ctx.client?.pendingOutgoing.has(id)) {
    ctx.client.pendingOutgoing.delete(id);
  }
}
