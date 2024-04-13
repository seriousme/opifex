import type { Context } from "../context.ts";
import { PacketType, type PubrelPacket } from "../deps.ts";

// A PUBREL Packet is the response to a PUBREC Packet.
// It is the third packet of the QoS 2 protocol exchange.

// Method A, Initiate onward delivery of the Application Message then discard message
// Send PUBCOMP <Packet Identifier>

export async function handlePubrel(
  ctx: Context,
  packet: PubrelPacket,
): Promise<void> {
  const id = packet.id;
  if (ctx.store.pendingIncoming.has(id)) {
    const storedPacket = ctx.store.pendingIncoming.get(id);
    if (storedPacket) {
      ctx.receivePublish(storedPacket);
      ctx.store.pendingIncoming.delete(id);
      await ctx.send({
        type: PacketType.pubcomp,
        id,
      });
    }
  }
}
