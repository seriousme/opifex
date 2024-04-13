import type { Context } from "../context.ts";
import { PacketType } from "../deps.ts";

export async function handlePingreq(ctx: Context): Promise<void> {
  await ctx.send({
    type: PacketType.pingres,
  });
}
