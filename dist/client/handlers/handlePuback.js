/**
 * Handles PUBACK packet processing for QoS level 1 PUBLISH responses
 * @param ctx - The MQTT client context
 * @param packet - The PUBACK packet received from the broker
 * @description
 * - Removes the packet ID from the list of pending outgoing messages
 * - Completes the corresponding publish operation
 */
export function handlePuback(ctx, packet) {
    const id = packet.id;
    ctx.store.pendingOutgoing.delete(id);
    ctx.receivePuback(id);
}
