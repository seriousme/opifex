import { SysPrefix } from "../context.ts";
import { PacketType } from "../deps.ts";
import type { Context } from "../context.ts";
import type { PublishPacket, Topic } from "../deps.ts";

/**
 * Checks if a client is authorized to publish to a given topic
 * @param ctx - The connection context
 * @param topic - The topic to check authorization for
 * @returns boolean indicating if client is authorized to publish
 */
function authorizedToPublish(ctx: Context, topic: Topic) {
  if (topic.startsWith(SysPrefix)) {
    return false;
  }
  if (ctx.handlers.isAuthorizedToPublish) {
    return ctx.handlers.isAuthorizedToPublish(ctx, topic);
  }
  return true;
}

/**
 * Handles MQTT PUBLISH packets
 * @param ctx - The connection context
 * @param packet - The PUBLISH packet to process
 * @returns Promise that resolves when packet is processed
 * @throws Error if packet processing fails
 */
export async function handlePublish(
  ctx: Context,
  packet: PublishPacket,
): Promise<void> {
  if (!authorizedToPublish(ctx, packet.topic)) {
    return;
  }

  const qos = packet.qos || 0;
  if (qos === 0) {
    ctx.persistence.publish(packet.topic, packet);
    return;
  }

  if (packet.id !== undefined) {
    // qos 1
    if (qos === 1) {
      const id = packet.id; // retain the id
      ctx.persistence.publish(packet.topic, packet);
      await ctx.send({
        type: PacketType.puback,
        protocolLevel: ctx.protocolLevel,
        id,
      });
      return;
    }

    /*
In the QoS 2 delivery protocol, the Receiver

- MUST respond with a PUBREC containing the Packet Identifier from the incoming PUBLISH Packet,
having accepted ownership of the Application Message.
- Until it has received the corresponding PUBREL packet, the Receiver MUST acknowledge any subsequent
PUBLISH packet with the same Packet Identifier by sending a PUBREC. It MUST NOT cause duplicate
messages to be delivered to any onward recipients in this case.
- MUST respond to a PUBREL packet by sending a PUBCOMP packet containing the same Packet Identifier as the PUBREL.
- After it has sent a PUBCOMP, the receiver MUST treat any subsequent PUBLISH packet that contains that Packet
Identifier as being a new publication.
[MQTT-4.3.3-2].
    */
    if (ctx.store) {
      if (!ctx.store.pendingIncoming.has(packet.id)) {
        ctx.persistence.publish(packet.topic, packet);
        ctx.store.pendingIncoming.add(packet.id);
      }
      await ctx.send({
        type: PacketType.pubrec,
        protocolLevel: ctx.protocolLevel,
        id: packet.id,
      });
    }
  }
}
