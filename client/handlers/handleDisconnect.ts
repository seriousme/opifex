import type { Context } from "../context.ts";
import type { DisconnectPacket } from "../deps.ts";
import { ReasonCodeByNumber } from "../deps.ts";

/**
 * Handles Disconnect Packet sent by the broker (V5 only)
 * @param ctx - The MQTT client context
 * @param packet - The PUBACK packet received from the broker
 * @description
 * - throw error
 */
export function handleDisconnect(ctx: Context, packet: DisconnectPacket): void {
  if (packet.protocolLevel === 5 && ((packet.reasonCode ?? 0) !== 0)) {
    throw new Error(ReasonCodeByNumber[packet.reasonCode!]);
  }
  ctx.close();
}
