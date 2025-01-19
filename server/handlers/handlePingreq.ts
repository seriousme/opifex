import type { Context } from "../context.ts";
import { PacketType } from "../deps.ts";

/**
 * Handles PINGREQ packet by responding with a PINGRESP packet
 * @param ctx - The connection context containing send method
 * @returns Promise that resolves when PINGRESP is sent
 */

export async function handlePingreq(ctx: Context): Promise<void> {
  await ctx.send({
    type: PacketType.pingres,
  });
}
