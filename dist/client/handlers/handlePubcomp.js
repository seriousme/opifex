// The PUBCOMP Packet is the response to a PUBREL Packet.
// It is the fourth and final packet of the QoS 2 protocol exchange.
export function handlePubcomp(ctx, packet) {
    const id = packet.id;
    if (ctx.store.pendingAckOutgoing.has(id)) {
        ctx.store.pendingAckOutgoing.delete(id);
        ctx.receivePuback(id);
    }
}
