import type {
  CodecOpts,
  PacketId,
  ProtocolLevelNoV5,
  QoS,
  TopicFilter,
  TPacketType,
  TRetainHandling,
} from "./types.ts";
import type { SubscribeProperties } from "./Properties.ts";
import { PacketType } from "./PacketType.ts";
import { BitMask } from "./BitMask.ts";
import { Encoder } from "./encoder.ts";
import { booleanFlag, Decoder, DecoderError } from "./decoder.ts";

/**
 * SubscribePacket is sent from client to server to subscribe to topics
 */
export type SubscribePacketV4 = {
  type: TPacketType;
  protocolLevel: ProtocolLevelNoV5;
  id: PacketId;
  subscriptions: Array<SubscriptionV4>;
};

export type SubscribePacketV5 = {
  type: TPacketType;
  protocolLevel: 5;
  id: PacketId;
  properties?: SubscribeProperties;
  subscriptions: Array<SubscriptionV5>;
};

export type SubscribePacket = SubscribePacketV4 | SubscribePacketV5;
/**
 * The topic to subscribe to and the associated QoS
 */
export type SubscriptionV4 = {
  topicFilter: TopicFilter;
  qos: QoS;
};

export type SubscriptionV5 = {
  topicFilter: TopicFilter;
  qos: QoS;
  noLocal?: boolean;
  retainAsPublished?: boolean;
  retainHandling?: TRetainHandling;
};

export type Subscription = SubscriptionV4 | SubscriptionV5;

export const subscribe: {
  encode(packet: SubscribePacket, codecOpts: CodecOpts): Uint8Array;
  decode(
    buffer: Uint8Array,
    flags: number,
    codecOpts: CodecOpts,
    packetType: TPacketType,
  ): SubscribePacket;
} = {
  encode(packet: SubscribePacket, codecOpts: CodecOpts): Uint8Array {
    // Bits 3,2,1 and 0 of the fixed header of the SUBSCRIBE Control Packet are reserved and
    // MUST be set to 0,0,1 and 0 respectively. The Server MUST treat any other value as
    // malformed and close the Network Connection [MQTT-3.8.1-1].
    const flags = 0b0010;

    const encoder = new Encoder(packet.type);
    encoder.setInt16(packet.id);
    if (packet.protocolLevel === 5) {
      encoder.setProperties(
        packet.properties || {},
        packet.type,
        codecOpts.maxOutgoingPacketSize,
      );
    }
    for (const sub of packet.subscriptions) {
      encoder.setTopic(sub.topicFilter);
      if (packet.protocolLevel === 5) {
        const {
          qos,
          noLocal = false,
          retainAsPublished = false,
          retainHandling = 0,
        } = sub as SubscriptionV5;
        const option = (qos & 1 ? BitMask.bit0 : 0) +
          (qos & 2 ? BitMask.bit1 : 0) +
          (noLocal ? BitMask.bit2 : 0) +
          (retainAsPublished ? BitMask.bit3 : 0) +
          ((retainHandling as number) & 1 ? BitMask.bit4 : 0) +
          ((retainHandling as number) & 2 ? BitMask.bit5 : 0);
        encoder.setByte(option);
      } else {
        encoder.setByte(sub.qos);
      }
    }
    return encoder.done(flags);
  },

  decode(
    buffer: Uint8Array,
    flags: number,
    codecOpts: CodecOpts,
    packetType: TPacketType,
  ): SubscribePacket {
    // Bits 3,2,1 and 0 of the fixed header of the SUBSCRIBE Control Packet are reserved and
    // MUST be set to 0,0,1 and 0 respectively. The Server MUST treat any other value as
    // malformed and close the Network Connection [MQTT-3.8.1-1].
    if (flags !== 0b0010) {
      throw new DecoderError("Invalid header");
    }
    const decoder = new Decoder(packetType, buffer);
    const id = decoder.getInt16();
    let properties = {};
    if (codecOpts.protocolLevel === 5) {
      properties = decoder.getProperties(PacketType.subscribe);
    }

    const subscriptions: Subscription[] = [];
    // The payload of a SUBSCRIBE packet MUST contain at least one Topic Filter / Option pair.
    // A SUBSCRIBE packet with no payload is a protocol violation [MQTT-3.8.3-3].
    do {
      const topicFilter = decoder.getTopicFilter();
      const option = decoder.getByte();
      const qos = option & 0b11;
      if (qos !== 0 && qos !== 1 && qos !== 2) {
        throw new DecoderError("Invalid qos");
      }
      if (qos > 0 && id === 0) {
        throw new DecoderError("Invalid packet identifier");
      }
      if (codecOpts.protocolLevel !== 5) {
        if (option !== qos) {
          throw new DecoderError("Invalid qos");
        }
        subscriptions.push({
          topicFilter: topicFilter,
          qos,
        } as SubscriptionV4);
      } else {
        // Bits 6 and 7 of the Subscription Options byte are reserved for future use.
        // The Server MUST treat a SUBSCRIBE packet as malformed if any of
        // Reserved bits in the Payload are non-zero [MQTT-3.8.3-5].
        if (option > 0b111111) {
          throw new DecoderError("Invalid subscription options");
        }
        const noLocal = booleanFlag(option, BitMask.bit2);
        const retainAsPublished = booleanFlag(option, BitMask.bit3);
        const retainHandling = (option & 0b110000) >> 4;
        if (
          retainHandling !== 0 && retainHandling !== 1 && retainHandling !== 2
        ) {
          throw new DecoderError("Invalid retain handling");
        }
        subscriptions.push({
          topicFilter: topicFilter,
          qos,
          noLocal,
          retainAsPublished,
          retainHandling,
        } as SubscriptionV5);
      }
    } while (!decoder.atEnd());
    decoder.done();
    if (codecOpts.protocolLevel !== 5) {
      return {
        type: PacketType.subscribe,
        protocolLevel: codecOpts.protocolLevel,
        id,
        subscriptions: subscriptions as Array<SubscriptionV4>,
      };
    }
    return {
      type: PacketType.subscribe,
      protocolLevel: 5,
      id,
      properties,
      subscriptions: subscriptions as Array<SubscriptionV5>,
    };
  },
};
