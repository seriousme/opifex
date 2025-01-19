import type { Context } from "../context.ts";

/**
 * Handles client disconnection by clearing the will message and closing the connection
 * @param {Context} ctx - The connection context object
 * @returns {void}
 */
export function handleDisconnect(ctx: Context): void {
  ctx.will = undefined;
  ctx.close();
}
