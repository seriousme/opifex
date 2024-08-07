import type { Context } from "../context.ts";
import { type AnyPacket, PacketType } from "../deps.ts";
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

export async function handlePacket(
  ctx: Context,
  packet: AnyPacket,
): Promise<void> {
  logger.debug("handling", PacketType[packet.type]);
  logger.debug(JSON.stringify(packet, null, 2));
  if (!ctx.connected) {
    if (packet.type === PacketType.connect) {
      handleConnect(ctx, packet);
    } else {
      throw new Error(
        `Received ${PacketType[packet.type]} packet before connect`,
      );
    }
  } else {
    switch (packet.type) {
      case PacketType.pingreq:
        await handlePingreq(ctx);
        break;
      case PacketType.publish:
        await handlePublish(ctx, packet);
        break;
      case PacketType.puback:
        handlePuback(ctx, packet);
        break;
      case PacketType.pubrel:
        await handlePubrel(ctx, packet);
        break;
      case PacketType.pubrec:
        await handlePubrec(ctx, packet);
        break;
      case PacketType.pubcomp:
        handlePubcomp(ctx, packet);
        break;
      case PacketType.subscribe:
        await handleSubscribe(ctx, packet);
        break;
      case PacketType.unsubscribe:
        await handleUnsubscribe(ctx, packet);
        break;
      case PacketType.disconnect:
        handleDisconnect(ctx);
        break;
      default:
        throw new Error(
          `Received unexpected ${PacketType[packet.type]} packet after connect`,
        );
    }
    ctx.timer?.reset();
  }
}
