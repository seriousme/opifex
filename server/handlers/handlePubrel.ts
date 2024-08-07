import type { Context } from "../context.ts";
import { PacketType, type PubrelPacket } from "../deps.ts";

// qos 2 only
// Method A, Initiate onward delivery of the Application Message1  then discard message
// Send PUBCOMP <Packet Identifier>

export async function handlePubrel(
  ctx: Context,
  packet: PubrelPacket,
): Promise<void> {
  const id = packet.id;
  if (ctx.store?.pendingIncoming.has(id)) {
    const storedPacket = ctx.store.pendingIncoming.get(id);
    if (storedPacket) {
      ctx.persistence.publish(storedPacket.topic, storedPacket);
      ctx.store.pendingIncoming.delete(id);
      await ctx.send({
        type: PacketType.pubcomp,
        id,
      });
    }
  }
}
