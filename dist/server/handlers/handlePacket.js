import { PacketNameByType, PacketType, } from "../deps.js";
import { handleConnect } from "./handleConnect.js";
import { handlePingreq } from "./handlePingreq.js";
import { handlePublish } from "./handlePublish.js";
import { handlePuback } from "./handlePuback.js";
import { handlePubrec } from "./handlePubrec.js";
import { handlePubrel } from "./handlePubrel.js";
import { handlePubcomp } from "./handlePubcomp.js";
import { handleSubscribe } from "./handleSubscribe.js";
import { handleUnsubscribe } from "./handleUnsubscribe.js";
import { handleDisconnect } from "./handleDisconnect.js";
import { logger } from "../deps.js";
/**
 * Handles incoming MQTT packets based on their type and connection state
 * @param ctx - The connection context containing client state and configuration
 * @param packet - The MQTT packet to handle
 * @throws Error if receiving unexpected packet types or packets before connect
 * @returns Promise that resolves when packet handling is complete
 */
export async function handlePacket(ctx, packet) {
    logger.debug("handling", PacketNameByType[packet.type]);
    logger.debug(JSON.stringify(packet, null, 2));
    if (!ctx.connected) {
        if (packet.type === PacketType.connect) {
            handleConnect(ctx, packet);
        }
        else {
            throw new Error(`Received ${PacketNameByType[packet.type]} packet before connect`);
        }
    }
    else {
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
                throw new Error(`Received unexpected ${PacketNameByType[packet.type]} packet after connect`);
        }
        ctx.timer?.reset();
    }
}
