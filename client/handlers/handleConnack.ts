import type { Context } from "../context.ts";
import { ConnectionState } from "../ConnectionState.ts";
import { AuthenticationResultByNumber, ReasonCodeByNumber } from "../deps.ts";
import type { ConnackPacket, TReasonCode } from "../deps.ts";

/**
 * Handles the CONNACK packet received from the MQTT broker
 * @param packet - The CONNACK packet containing the connection acknowledgment
 * @param ctx - The connection context
 * @returns Promise that resolves when handling is complete
 */
export async function handleConnack(packet: ConnackPacket, ctx: Context) {
  const result = packet.protocolLevel === 5
    ? packet.reasonCode
    : packet.returnCode;
  if (result === 0) {
    ctx.connectionState = ConnectionState.connected;
    if (ctx.mqttConn) {
      ctx.mqttConn.codecOpts.protocolLevel = ctx.protocolLevel;
    }
    ctx.pingTimer?.reset();
    ctx.unresolvedConnect?.resolve(result);
    // start transmitting packets that were queued before
    for await (const packet of ctx.store.pendingOutgoingPackets()) {
      await ctx.send(packet);
    }
    return;
  }

  const errMsg = packet.protocolLevel === 5
    ? ReasonCodeByNumber[result as TReasonCode]
    : AuthenticationResultByNumber[result];

  const err = new Error(
    `Connect failed: ${errMsg}`,
  );
  ctx.connectionState = ConnectionState.disconnecting;
  ctx.pingTimer?.clear();
  ctx.unresolvedConnect?.reject(err);
}
