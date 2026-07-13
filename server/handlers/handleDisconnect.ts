import type { Context } from "../context.ts";

/**
 * Handles client disconnection by clearing the will message and closing the connection
 * @param {Context} ctx - The connection context object
 * @returns {void}
 */
export async function handleDisconnect(ctx: Context): Promise<void> {
  // close the context without sending the will
  await ctx.close(false);
}
