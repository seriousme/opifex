import type { Context } from "../context.ts";
import { PacketType, type PubrecPacket } from "../deps.ts";

// qos 2
// Discard message, Store PUBREC received <Packet Identifier>
// send PUBREL <Packet Identifier>
export async function handlePubrec(
  ctx: Context,
  packet: PubrecPacket,
): Promise<void> {
  const id = packet.id;
  if (ctx.store?.pendingOutgoing.has(id)) {
    ctx.store.pendingOutgoing.delete(id);
    ctx.store.pendingAckOutgoing.add(id);
    await ctx.send({
      type: PacketType.pubrel,
      id,
    });
  }
}
