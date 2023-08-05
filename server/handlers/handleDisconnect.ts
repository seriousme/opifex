import { Context } from "../context.ts";

export function handleDisconnect(
  ctx: Context,
): void {
  ctx.will = undefined;
  ctx.close();
}
