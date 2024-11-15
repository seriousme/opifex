// The UNSUBACK Packet is sent by the Server to the Client to confirm receipt
// of an UNSUBSCRIBE Packet.
export function handleUnsuback(ctx, packet) {
    const id = packet.id;
    ctx.store.pendingOutgoing.delete(id);
    ctx.receiveUnsuback(id);
}
