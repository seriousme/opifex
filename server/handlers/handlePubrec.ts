import { Context } from "../context.ts";
import { PacketType, PubrecPacket } from "../deps.ts";

// qos 2
// Discard message, Store PUBREC received <Packet Identifier>
// send PUBREL <Packet Identifier>
export async function handlePubrec(
  ctx: Context,
  packet: PubrecPacket,
): Promise<void> {
  const id = packet.id;
  if (ctx.client && ctx.client.pendingOutgoing.has(id)) {
    ctx.client.pendingOutgoing.delete(id);
    ctx.client.pendingAckOutgoing.add(id);
    await ctx.send({
      type: PacketType.pubrel,
      id,
    });
  }
}
