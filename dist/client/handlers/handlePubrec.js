import { PacketType } from "../deps.js";
// A PUBREC Packet is the response to a PUBLISH Packet with QoS 2.
// It is the second packet of the QoS 2 protocol exchange.
// Discard message, Store PUBREC received <Packet Identifier>
// send PUBREL <Packet Identifier>
export async function handlePubrec(ctx, packet) {
    const id = packet.id;
    const ack = {
        type: PacketType.pubrel,
        id,
    };
    if (ctx.store.pendingOutgoing.has(id)) {
        ctx.store.pendingAckOutgoing.set(id, ack);
        ctx.store.pendingOutgoing.delete(id);
        await ctx.send(ack);
    }
}
