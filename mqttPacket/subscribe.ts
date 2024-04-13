import {
  BitMask,
  type PacketId,
  PacketType,
  type QoS,
  type TopicFilter,
} from "./types.ts";
import { Encoder } from "./encoder.ts";
import { booleanFlag, Decoder, DecoderError } from "./decoder.ts";

export type SubscribePacket = {
  type: PacketType.subscribe;
  id: PacketId;
  subscriptions: Subscription[];
};

export type Subscription = {
  topicFilter: TopicFilter;
  qos: QoS;
};

export default {
  encode(packet: SubscribePacket) {
    // Bits 3,2,1 and 0 of the fixed header of the SUBSCRIBE Control Packet are reserved and
    // MUST be set to 0,0,1 and 0 respectively. The Server MUST treat any other value as
    // malformed and close the Network Connection [MQTT-3.8.1-1].
    const flags = 0b0010;

    const encoder = new Encoder();
    encoder.setInt16(packet.id);
    for (const sub of packet.subscriptions) {
      encoder.setTopic(sub.topicFilter);
      encoder.setByte(sub.qos);
    }
    return { flags, bytes: encoder.done() };
  },

  decode(buffer: Uint8Array, flags: number): SubscribePacket {
    // Bits 3,2,1 and 0 of the fixed header of the SUBSCRIBE Control Packet are reserved and
    // MUST be set to 0,0,1 and 0 respectively. The Server MUST treat any other value as
    // malformed and close the Network Connection [MQTT-3.8.1-1].
    if (!booleanFlag(flags, BitMask.bit1)) {
      throw new DecoderError("Invalid header");
    }

    const decoder = new Decoder(buffer);
    const id = decoder.getInt16();

    const subscriptions: Subscription[] = [];
    // The payload of a SUBSCRIBE packet MUST contain at least one Topic Filter / QoS pair.
    // A SUBSCRIBE packet with no payload is a protocol violation [MQTT-3.8.3-3].
    do {
      const topicFilter = decoder.getTopicFilter();
      const qos = decoder.getByte();
      if (qos !== 0 && qos !== 1 && qos !== 2) {
        throw new DecoderError("Invalid qos");
      }
      if (qos > 0 && id === 0) {
        throw new DecoderError("Invalid packet identifier");
      }
      subscriptions.push({
        topicFilter: topicFilter,
        qos,
      });
    } while (!decoder.atEnd());
    decoder.done();
    return {
      type: PacketType.subscribe,
      id,
      subscriptions,
    };
  },
};
