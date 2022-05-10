import { Context } from "../context.ts";

export async function handleDisconnect(
  ctx: Context,
): Promise<void> {
  ctx.will = undefined;
  ctx.close();
}
