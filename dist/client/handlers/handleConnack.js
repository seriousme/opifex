import { ConnectionState } from "../ConnectionState.js";
import { AuthenticationResultByNumber } from "../deps.js";
/**
 * Handles the CONNACK packet received from the MQTT broker
 * @param packet - The CONNACK packet containing the connection acknowledgment
 * @param ctx - The connection context
 * @returns Promise that resolves when handling is complete
 */
export async function handleConnack(packet, ctx) {
    if (packet.returnCode === 0) {
        ctx.connectionState = ConnectionState.connected;
        ctx.pingTimer?.reset();
        ctx.unresolvedConnect?.resolve(packet.returnCode);
        // start transmitting packets that were queued before
        for await (const packet of ctx.store.pendingOutgoingPackets()) {
            ctx.send(packet);
        }
        return;
    }
    const err = new Error(`Connect failed: ${AuthenticationResultByNumber[packet.returnCode]}`);
    ctx.connectionState = ConnectionState.disconnecting;
    ctx.pingTimer?.clear();
    ctx.unresolvedConnect?.reject(err);
}
