import { ConnectionState, Context } from "../context.ts";
import { AnyPacket, PacketType } from "../deps.ts";
import { handleConnack } from "./handleConnack.ts";
import { handlePublish } from "./handlePublish.ts";
// import { handlePuback } from "./handlePuback.ts";
// import { handlePubrec } from "./handlePubrec.ts";
import { handlePubrel } from "./handlePubrel.ts";
// import { handlePubcomp } from "./handlePubcomp.ts";
import { debug } from "../deps.ts";

export function handlePacket(ctx:Context, packet: AnyPacket): void {
  debug.log({ received: JSON.stringify(packet, null, 2) });
  if(ctx.connectionState !== ConnectionState.connected) {
    if(packet.type === PacketType.connack) {
      handleConnack(packet,ctx)
    } else {
      throw new Error(
        `Received ${PacketType[packet.type]} packet before connect`
      );
    }
  } else {
    switch(packet.type) {
      case PacketType.publish:
        handlePublish(ctx,packet);
        break;
      case PacketType.pubrel:
          handlePubrel(ctx,packet);
          break;
      case PacketType.pingres:
        break;
      case PacketType.suback:
        break;
      default:
        throw new Error(
          `Received unexpected ${PacketType[packet.type]} packet after connect`
        );
        break;
    }
  }
}

