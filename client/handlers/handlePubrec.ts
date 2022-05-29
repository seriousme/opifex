import { Context } from "../context.ts";
import { PacketType, PubrecPacket } from "../deps.ts";

// A PUBREC Packet is the response to a PUBLISH Packet with QoS 2.
// It is the second packet of the QoS 2 protocol exchange.

// Discard message, Store PUBREC received <Packet Identifier>
// send PUBREL <Packet Identifier>

export async function handlePubrec(
  ctx: Context,
  packet: PubrecPacket,
): Promise<void> {
  const id = packet.id;
  if (ctx.store.pendingOutgoing.has(id)) {
    ctx.store.pendingAckOutgoing.add(id);
    ctx.store.pendingOutgoing.delete(id);
    await ctx.send({
      type: PacketType.pubrel,
      id,
    });
  }
}
