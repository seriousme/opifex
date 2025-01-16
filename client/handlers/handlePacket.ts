import type { Context } from "../context.ts";
import { ConnectionState } from "../ConnectionState.ts";
import { handleConnack } from "./handleConnack.ts";
import { handlePublish } from "./handlePublish.ts";
import { handlePuback } from "./handlePuback.ts";
import { handlePubrec } from "./handlePubrec.ts";
import { handlePubrel } from "./handlePubrel.ts";
import { handlePubcomp } from "./handlePubcomp.ts";
import { handleSuback } from "./handleSuback.ts";
import { handleUnsuback } from "./handleUnsuback.ts";
import { logger, PacketNameByType, PacketType } from "../deps.ts";
import type {
  AnyPacket,
  ConnackPacket,
  PubackPacket,
  PubcompPacket,
  PublishPacket,
  PubrecPacket,
  PubrelPacket,
  SubackPacket,
  UnsubackPacket,
} from "../deps.ts";

export async function handlePacket(
  ctx: Context,
  packet: AnyPacket,
): Promise<void> {
  logger.debug({ received: PacketNameByType[packet.type], packet });
  if (ctx.connectionState !== ConnectionState.connected) {
    if (packet.type === PacketType.connack) {
      handleConnack(packet as ConnackPacket, ctx);
    } else {
      throw new Error(
        `Received ${PacketNameByType[packet.type]} packet before connect`,
      );
    }
  } else {
    switch (packet.type) {
      case PacketType.pingres:
        break;
      case PacketType.publish:
        await handlePublish(ctx, packet as PublishPacket);
        break;
      case PacketType.puback:
        await handlePuback(ctx, packet as PubackPacket);
        break;
      case PacketType.pubrel:
        await handlePubrel(ctx, packet as PubrelPacket);
        break;
      case PacketType.pubrec:
        await handlePubrec(ctx, packet as PubrecPacket);
        break;
      case PacketType.pubcomp:
        await handlePubcomp(ctx, packet as PubcompPacket);
        break;
      case PacketType.suback:
        await handleSuback(ctx, packet as SubackPacket);
        break;
      case PacketType.unsuback:
        handleUnsuback(ctx, packet as UnsubackPacket);
        break;

      default:
        throw new Error(
          `Received unexpected ${
            PacketNameByType[packet.type]
          } packet after connect`,
        );
    }
  }
}
