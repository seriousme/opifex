import type {
  CodecOpts,
  Dup,
  Payload,
  ProtocolLevelNoV5,
  QoS,
  Topic,
  TPacketType,
} from "./types.ts";
import type { PublishProperties } from "./Properties.ts";
import { PacketType } from "./PacketType.ts";
import { BitMask } from "./BitMask.ts";
import { Encoder, EncoderError } from "./encoder.ts";
import { booleanFlag, Decoder, DecoderError } from "./decoder.ts";

/**
 * PublishPacket is used to send data from client to server and
 * from server to subscribers
 */
export type PublishPacketV4 = {
  type: TPacketType;
  protocolLevel: ProtocolLevelNoV5;
  topic: Topic;
  payload: Payload;
  dup?: Dup;
  retain?: boolean;
  qos?: QoS;
  id?: number;
};
export type PublishPacketV5 = {
  type: TPacketType;
  protocolLevel: 5;
  topic: Topic;
  payload: Payload;
  dup?: Dup;
  retain?: boolean;
  qos?: QoS;
  id?: number;
  properties?: PublishProperties;
};

export type PublishPacket = PublishPacketV4 | PublishPacketV5;

export const publish: {
  encode(packet: PublishPacket, _codecOpts: CodecOpts): Uint8Array;
  decode(
    buffer: Uint8Array,
    flags: number,
    codecOpts: CodecOpts,
  ): PublishPacket;
} = {
  encode(packet: PublishPacket, codecOpts: CodecOpts): Uint8Array {
    const qos = packet.qos || 0;

    const flags = (packet.dup ? BitMask.bit3 : 0) +
      (qos & 2 ? BitMask.bit2 : 0) +
      (qos & 1 ? BitMask.bit1 : 0) +
      (packet.retain ? BitMask.bit0 : 0);

    const encoder = new Encoder(packet.type);
    encoder.setTopic(packet.topic);

    if (qos === 1 || qos === 2) {
      if (typeof packet.id !== "number" || packet.id < 1) {
        throw new EncoderError("when qos is 1 or 2, packet must have id");
      }
      encoder.setInt16(packet.id);
    }

    if (packet.protocolLevel === 5) {
      encoder.setProperties(
        packet.properties || {},
        PacketType.publish,
        codecOpts.maxOutgoingPacketSize,
      );
    }
    encoder.setRemainder(packet.payload);
    return encoder.done(flags);
  },

  decode(
    buffer: Uint8Array,
    flags: number,
    codecOpts: CodecOpts,
  ): PublishPacket {
    const dup = booleanFlag(flags, BitMask.bit3);
    const qos = (flags & 6) >> 1;
    const retain = booleanFlag(flags, BitMask.bit0);

    if (qos !== 0 && qos !== 1 && qos !== 2) {
      throw new DecoderError("Invalid qos");
    }

    if (dup && qos === 0) {
      throw new DecoderError("Invalid qos for possible duplicate");
    }

    const decoder = new Decoder(buffer);
    const topic = decoder.getTopic();

    let id = 0;
    if (qos > 0) {
      id = decoder.getInt16();
    }
    if (codecOpts.protocolLevel === 5) {
      const properties = decoder.getProperties(PacketType.publish);
      const payload = decoder.getRemainder();
      return {
        type: PacketType.publish,
        protocolLevel: 5,
        properties,
        topic,
        payload,
        dup,
        retain,
        qos,
        id,
      };
    }
    // no decoder.done() required because of getRemainder
    const payload = decoder.getRemainder();
    return {
      type: PacketType.publish,
      protocolLevel: codecOpts.protocolLevel,
      topic,
      payload,
      dup,
      retain,
      qos,
      id,
    };
  },
};
