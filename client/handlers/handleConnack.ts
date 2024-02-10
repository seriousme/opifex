import { ConnectionState, Context } from "../context.ts";
import { AuthenticationResult, ConnackPacket } from "../deps.ts";

export async function handleConnack(packet: ConnackPacket, ctx: Context) {
	if (packet.returnCode === 0) {
		ctx.connectionState = ConnectionState.connected;
		ctx.pingTimer?.reset();
		ctx.unresolvedConnect?.resolve(packet.returnCode);
		// start transmitting packets that were queued before
		for await (const packet of ctx.store.pendingOutgoingPackets()) {
			ctx.send(packet);
		}
		return;
	}
	const err = new Error(
		`Connect failed: ${AuthenticationResult[packet.returnCode]}`,
	);
	ctx.connectionState = ConnectionState.disconnecting;
	ctx.pingTimer?.clear();
	ctx.unresolvedConnect?.reject(err);
}
