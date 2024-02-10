import { Context } from "../context.ts";
import { PubackPacket } from "../deps.ts";

// A PUBACK Packet is the response to a PUBLISH Packet with QoS level 1.

export function handlePuback(ctx: Context, packet: PubackPacket) {
	// qos 1 only
	const id = packet.id;
	if (ctx.store?.pendingOutgoing.has(id)) {
		ctx.store.pendingOutgoing.delete(id);
	}
}
