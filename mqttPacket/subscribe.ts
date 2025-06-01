import type {
  PacketId,
  ProtocolLevel,
  QoS,
  TopicFilter,
  TPacketType,
} from "./types.ts";
import { PacketType } from "./PacketType.ts";
import { BitMask } from "./BitMask.ts";
import { Encoder } from "./encoder.ts";
import { booleanFlag, Decoder, DecoderError } from "./decoder.ts";

/**
 * SubscribePacket is sent from client to server to subscribe to topics
 */
export type SubscribePacket = {
  type: TPacketType;
  id: PacketId;
  subscriptions: Subscription[];
};

/**
 * The topic to subscribe to and the associated QoS
 */
export type Subscription = {
  topicFilter: TopicFilter;
  qos: QoS;
};

export const subscribe: {
  encode(packet: SubscribePacket): { flags: number; bytes: number[] };
  decode(
    buffer: Uint8Array,
    flags: number,
    protocolLevel: ProtocolLevel,
  ): SubscribePacket;
} = {
  encode(packet: SubscribePacket): { flags: number; bytes: number[] } {
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

  decode(
    buffer: Uint8Array,
    flags: number,
    protocolLevel: ProtocolLevel,
  ): SubscribePacket {
    if (protocolLevel === 5) {
      throw new DecoderError("Invalid protocol version");
    }
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
