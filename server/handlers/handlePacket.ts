import type { Context } from "../context.ts";
import { PacketNameByType, PacketType } from "../deps.ts";
import type {
  AnyPacket,
  PubackPacket,
  PubcompPacket,
  PublishPacket,
  PubrecPacket,
  PubrelPacket,
  SubscribePacket,
  UnsubscribePacket,
} from "../deps.ts";
import { handleConnect } from "./handleConnect.ts";
import { handlePingreq } from "./handlePingreq.ts";
import { handlePublish } from "./handlePublish.ts";
import { handlePuback } from "./handlePuback.ts";
import { handlePubrec } from "./handlePubrec.ts";
import { handlePubrel } from "./handlePubrel.ts";
import { handlePubcomp } from "./handlePubcomp.ts";
import { handleSubscribe } from "./handleSubscribe.ts";
import { handleUnsubscribe } from "./handleUnsubscribe.ts";
import { handleDisconnect } from "./handleDisconnect.ts";
import { logger } from "../deps.ts";

/**
 * Handles incoming MQTT packets based on their type and connection state
 * @param ctx - The connection context containing client state and configuration
 * @param packet - The MQTT packet to handle
 * @throws Error if receiving unexpected packet types or packets before connect
 * @returns Promise that resolves when packet handling is complete
 */
export async function handlePacket(
  ctx: Context,
  packet: AnyPacket,
): Promise<void> {
  logger.debug("handling", PacketNameByType[packet.type]);
  logger.debug(JSON.stringify(packet, null, 2));
  if (!ctx.connected) {
    if (packet.type === PacketType.connect) {
      handleConnect(ctx, packet);
    } else {
      throw new Error(
        `Received ${PacketNameByType[packet.type]} packet before connect`,
      );
    }
  } else {
    switch (packet.type) {
      case PacketType.pingreq:
        await handlePingreq(ctx);
        break;
      case PacketType.publish:
        await handlePublish(ctx, packet as PublishPacket);
        break;
      case PacketType.puback:
        handlePuback(ctx, packet as PubackPacket);
        break;
      case PacketType.pubrel:
        await handlePubrel(ctx, packet as PubrelPacket);
        break;
      case PacketType.pubrec:
        await handlePubrec(ctx, packet as PubrecPacket);
        break;
      case PacketType.pubcomp:
        handlePubcomp(ctx, packet as PubcompPacket);
        break;
      case PacketType.subscribe:
        await handleSubscribe(ctx, packet as SubscribePacket);
        break;
      case PacketType.unsubscribe:
        await handleUnsubscribe(ctx, packet as UnsubscribePacket);
        break;
      case PacketType.disconnect:
        handleDisconnect(ctx);
        break;
      default:
        throw new Error(
          `Received unexpected ${
            PacketNameByType[packet.type]
          } packet after connect`,
        );
    }
    ctx.timer?.reset();
  }
}
