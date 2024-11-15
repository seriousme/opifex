import { PacketType } from "../deps.js";
// qos 2
// Discard message, Store PUBREC received <Packet Identifier>
// send PUBREL <Packet Identifier>
export async function handlePubrec(ctx, packet) {
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
