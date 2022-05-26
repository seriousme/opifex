import { ConnectionState, Ctx } from "../context.ts";
import { AnyPacket, PacketType } from "../deps.ts";
// import { handleConnect } from "./handleConnect.ts";
// import { handlePingreq } from "./handlePingreq.ts";
// import { handlePublish } from "./handlePublish.ts";
// import { handlePuback } from "./handlePuback.ts";
// import { handlePubrec } from "./handlePubrec.ts";
// import { handlePubrel } from "./handlePubrel.ts";
// import { handlePubcomp } from "./handlePubcomp.ts";
// import { handleSubscribe } from "./handleSubscribe.ts";
// import { handleUnsubscribe } from "./handleUnsubscribe.ts";
// import { handleDisconnect } from "./handleDisconnect.ts";
import { debug } from "../deps.ts";

export function handlePacket(ctx:Ctx, packet: AnyPacket) {
  debug.log({ received: JSON.stringify(packet, null, 2) });
  if(ctx.connectionState !== ConnectionState.connected) {
    if(packet.type === PacketType.connack) {
      ctx.connectionState = ConnectionState.connected;
      ctx.pingTimer?.reset();
      ctx.unresolvedConnect?.resolve(packet.returnCode);
      ctx.onconnect();
    } else {
      throw new Error(
        `Received ${PacketType[packet.type]} packet before connect`
      );
    }
  } else {
    switch(packet.type) {
      case PacketType.publish:
        const message = new TextDecoder().decode(packet.payload);
        debug.log(
          `publish: topic: ${packet.topic} message: ${message}`
        );
        ctx.onmessage(packet);
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

