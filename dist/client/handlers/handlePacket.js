import { ConnectionState } from "../ConnectionState.js";
import { handleConnack } from "./handleConnack.js";
import { handlePublish } from "./handlePublish.js";
import { handlePuback } from "./handlePuback.js";
import { handlePubrec } from "./handlePubrec.js";
import { handlePubrel } from "./handlePubrel.js";
import { handlePubcomp } from "./handlePubcomp.js";
import { handleSuback } from "./handleSuback.js";
import { handleUnsuback } from "./handleUnsuback.js";
import { logger, PacketNameByType, PacketType } from "../deps.js";
/**
 * Handles incoming MQTT packets based on the connection state and packet type
 * @param ctx - The MQTT client context containing connection state and other information
 * @param packet - The MQTT packet to handle
 * @throws Error if an unexpected packet is received before connection is established
 * @throws Error if an unexpected packet type is received after connection
 */
export async function handlePacket(ctx, packet) {
    logger.debug({ received: PacketNameByType[packet.type], packet });
    if (ctx.connectionState !== ConnectionState.connected) {
        if (packet.type === PacketType.connack) {
            handleConnack(packet, ctx);
        }
        else {
            throw new Error(`Received ${PacketNameByType[packet.type]} packet before connect`);
        }
    }
    else {
        switch (packet.type) {
            case PacketType.pingres:
                break;
            case PacketType.publish:
                await handlePublish(ctx, packet);
                break;
            case PacketType.puback:
                await handlePuback(ctx, packet);
                break;
            case PacketType.pubrel:
                await handlePubrel(ctx, packet);
                break;
            case PacketType.pubrec:
                await handlePubrec(ctx, packet);
                break;
            case PacketType.pubcomp:
                await handlePubcomp(ctx, packet);
                break;
            case PacketType.suback:
                await handleSuback(ctx, packet);
                break;
            case PacketType.unsuback:
                handleUnsuback(ctx, packet);
                break;
            default:
                throw new Error(`Received unexpected ${PacketNameByType[packet.type]} packet after connect`);
        }
    }
}
