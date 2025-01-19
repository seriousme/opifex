/**
 * Handles the UNSUBACK packet received from the server
 * @param ctx - The MQTT client context
 * @param packet - The UNSUBACK packet received from the server
 * @description
 * The UNSUBACK Packet is sent by the Server to the Client to confirm receipt of
 * an UNSUBSCRIBE Packet.
 * When received, it removes the pending outgoing request and completes the corresponding
 * unsubscribe operation.
 */
export function handleUnsuback(ctx, packet) {
    const id = packet.id;
    ctx.store.pendingOutgoing.delete(id);
    ctx.receiveUnsuback(id);
}
