import { PacketType } from "../deps.js";
export async function handlePingreq(ctx) {
    await ctx.send({
        type: PacketType.pingres,
    });
}
