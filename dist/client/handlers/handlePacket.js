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
export async function handlePacket(ctx, packet) {
    logger.debug({ received: JSON.stringify(packet, null, 2) });
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
