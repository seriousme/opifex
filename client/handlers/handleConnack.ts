import { ConnectionState, Context } from "../context.ts";
import { ConnackPacket, AuthenticationResult, PacketType } from "../deps.ts";

export function handleConnack(packet: ConnackPacket, ctx: Context) {
  if (packet.returnCode === 0) {
    ctx.connectionState = ConnectionState.connected;
    ctx.pingTimer?.reset();
    ctx.unresolvedConnect?.resolve(packet.returnCode);
    // start transmitting packets that were queued before
    for (const id of ctx.store.pendingAckOutgoing){
      ctx.send({
        type: PacketType.pubrel,
        id,
      });
    }

    for (const [_,packet] of ctx.store.pendingOutgoing){
      ctx.send(packet);
    }
    return;
  }
  const err = new Error(`Connect failed: ${AuthenticationResult[packet.returnCode]}`);
  ctx.connectionState = ConnectionState.disconnecting;
  ctx.pingTimer?.clear();
  ctx.unresolvedConnect?.reject(err);
}
