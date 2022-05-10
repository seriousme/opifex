import { Context } from "../context.ts";
import { PacketType, PubrelPacket } from "../deps.ts";

// qos 2 only
// Method A, Initiate onward delivery of the Application Message1  then discard message
// Send PUBCOMP <Packet Identifier>

export async function handlePubrel(
  ctx: Context,
  packet: PubrelPacket,
): Promise<void> {
  const id = packet.id;
  if (ctx.client && ctx.client.incomming.has(id)) {
    const storedPacket = ctx.client.incomming.get(id);
    if (storedPacket) {
      ctx.persistence.publish(storedPacket.topic, storedPacket);
    }
    ctx.client.incomming.delete(id);
    await ctx.send({
      type: PacketType.pubcomp,
      id,
    });
  }
}
