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
 * Represents an MQTT SUBSCRIBE packet conforming to MQTT version 3.1.1 (Protocol Level 4) or lower.
 */
export type SubscribePacketV4 = {
  /** The type of the MQTT control packet. */
  type: TPacketType;
  /** The protocol version level, restricted to non-v5 variants. */
  protocolLevel: ProtocolLevelNoV5;
  /** The unique 16-bit packet identifier. */
  id: PacketId;
  /** The list of topic subscriptions associated with this packet. */
  subscriptions: Array<SubscriptionV4>;
};

/**
 * Represents an MQTT SUBSCRIBE packet conforming to MQTT version 5.0.
 */
export type SubscribePacketV5 = {
  /** The type of the MQTT control packet. */
  type: TPacketType;
  /** The protocol version level, strictly set to 5. */
  protocolLevel: 5;
  /** The unique 16-bit packet identifier. */
  id: PacketId;
  /** Optional user and protocol properties introduced in MQTT v5. */
  properties?: SubscribeProperties;
  /** The list of topic subscriptions including v5 option flags. */
  subscriptions: Array<SubscriptionV5>;
};

/**
 * Represents a union of available MQTT SUBSCRIBE packets (v4 or v5) sent from client to server.
 */
export type SubscribePacket = SubscribePacketV4 | SubscribePacketV5;

/**
 * Describes a topic subscription requirement for MQTT version 3.1.1.
 */
export type SubscriptionV4 = {
  /** The topic filter expression the client intends to subscribe to. */
  topicFilter: TopicFilter;
  /** The maximum Quality of Service level authorized for this topic filter. */
  qos: QoS;
};

/**
 * Describes a topic subscription requirement for MQTT version 5.0, including extended flags.
 */
export type SubscriptionV5 = {
  /** The topic filter expression the client intends to subscribe to. */
  topicFilter: TopicFilter;
  /** The maximum Quality of Service level authorized for this topic filter. */
  qos: QoS;
  /** Optional flag indicating whether messages should not be forwarded back to the client that published them. */
  noLocal?: boolean;
  /** Optional flag indicating whether messages forwarded under this subscription keep their original retain flag. */
  retainAsPublished?: boolean;
  /** Optional setting declaring how retained messages are handled when the subscription is created. */
  retainHandling?: TRetainHandling;
};

/** * Represents a generic union of MQTT subscription configurations (v4 or v5).
 */
export type Subscription = SubscriptionV4 | SubscriptionV5;

/**
 * Codec utility object responsible for encoding and decoding MQTT SUBSCRIBE control packets.
 */
export const subscribe: {
  /**
   * Serializes a SubscribePacket into an MQTT compliant binary buffer.
   * @param {SubscribePacket} packet - The subscribe packet model to encode.
   * @param {CodecOpts} codecOpts - The configuration options regulating serialization limits.
   * @returns {Uint8Array} The fully encoded binary payload.
   */
  encode(packet: SubscribePacket, codecOpts: CodecOpts): Uint8Array;
  /**
   * Deserializes a binary payload into a structured SubscribePacket instance.
   * @param {Uint8Array} buffer - The binary buffer slice containing the packet.
   * @param {number} flags - The exact configuration flags parsed from the fixed header.
   * @param {CodecOpts} codecOpts - Configuration properties outlining the contextual protocol parser levels.
   * @param {TPacketType} packetType - The explicit control packet identifier byte.
   * @returns {SubscribePacket} A parsed instance of SubscribePacket V4 or V5.
   */
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
      encoder.setTopicFilter(sub.topicFilter);
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
