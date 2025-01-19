import { PacketType } from "../deps.js";
/**
 * Handles PUBREC (Publish Received) packets for QoS 2 message flow
 * It is the second packet of the QoS 2 protocol exchange.
 * @param ctx - The connection context containing message stores and send function
 * @param packet - The received PUBREC packet
 * @description
 * When a PUBREC packet is received:
 * 1. Checks if there is a pending outgoing message with matching packet ID
 * 2. Creates a PUBREL packet to acknowledge the PUBREC
 * 3. Add the packet ID to pendingAckOutgoing store
 * 4. Removes the message from pendingOutgoing store
 * 5. Sends the PUBREL packet
 */
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
