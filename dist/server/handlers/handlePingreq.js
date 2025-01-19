import { PacketType } from "../deps.js";
/**
 * Handles PINGREQ packet by responding with a PINGRESP packet
 * @param ctx - The connection context containing send method
 * @returns Promise that resolves when PINGRESP is sent
 */
export async function handlePingreq(ctx) {
    await ctx.send({
        type: PacketType.pingres,
    });
}
