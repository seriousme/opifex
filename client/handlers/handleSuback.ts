import type { Context } from "../context.ts";
import type { SubackPacket } from "../deps.ts";

// A SUBACK Packet is sent by the Server to the Client to confirm receipt
// and processing of a SUBSCRIBE Packet.

// A SUBACK Packet contains a list of return codes, that specify the maximum QoS level
// that was granted in each Subscription that was requested by the SUBSCRIBE.

export function handleSuback(ctx: Context, packet: SubackPacket): void {
  const id = packet.id;
  ctx.store.pendingOutgoing.delete(id);
  ctx.receiveSuback(id, packet.returnCodes);
}
