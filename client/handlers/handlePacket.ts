import type { Context } from "../context.ts";
import { ConnectionState } from "../ConnectionState.ts";
import { handleAuth } from "./handleAuth.ts";
import { handleConnack } from "./handleConnack.ts";
import { handlePublish } from "./handlePublish.ts";
import { handlePuback } from "./handlePuback.ts";
import { handlePubrec } from "./handlePubrec.ts";
import { handlePubrel } from "./handlePubrel.ts";
import { handlePubcomp } from "./handlePubcomp.ts";
import { handleSuback } from "./handleSuback.ts";
import { handleUnsuback } from "./handleUnsuback.ts";
import { handleDisconnect } from "./handleDisconnect.ts";
import { logger, PacketNameByType, PacketType } from "../deps.ts";
import type {
  AnyPacket,
  AuthPacket,
  ConnackPacket,
  DisconnectPacket,
  PubackPacket,
  PubcompPacket,
  PublishPacket,
  PubrecPacket,
  PubrelPacket,
  SubackPacket,
  UnsubackPacket,
} from "../deps.ts";

/**
 * Handles incoming MQTT packets based on the connection state and packet type
 * @param ctx - The MQTT client context containing connection state and other information
 * @param packet - The MQTT packet to handle
 * @throws Error if an unexpected packet is received before connection is established
 * @throws Error if an unexpected packet type is received after connection
 */
export async function handlePacket(
  ctx: Context,
  packet: AnyPacket,
): Promise<void> {
  logger.debug({ received: PacketNameByType[packet.type], packet });
  if (ctx.connectionState !== ConnectionState.connected) {
    if (packet.type === PacketType.connack) {
      handleConnack(ctx, packet as ConnackPacket);
      return;
    }
    if (packet.type === PacketType.auth) {
      await handleAuth(ctx, packet as AuthPacket);
      return;
    }
    throw new Error(
      `Received ${PacketNameByType[packet.type]} packet while connecting`,
    );
  } else {
    switch (packet.type) {
      case PacketType.auth:
        await handleAuth(ctx, packet as AuthPacket);
        break;
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
      case PacketType.disconnect:
        handleDisconnect(ctx, packet as DisconnectPacket);
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
