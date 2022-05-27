import { ConnectionState, Context } from "../context.ts";
import { ConnackPacket } from "../deps.ts";

export function handleConnack(packet: ConnackPacket, ctx: Context) {
  if (packet.returnCode === 0) {
    ctx.connectionState = ConnectionState.connected;
    ctx.pingTimer?.reset();
    ctx.unresolvedConnect?.resolve(packet.returnCode);
    ctx.onconnect();
    return;
  }
  ctx.onerror(new Error(`Connection failed, returnCode: ${packet.returnCode}`))
  ctx.close();
}
