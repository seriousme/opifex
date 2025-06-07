import type {
  Dup,
  Payload,
  ProtocolLevel,
  QoS,
  Topic,
  TPacketType,
} from "./types.ts";
import { PacketType } from "./PacketType.ts";
import { BitMask } from "./BitMask.ts";
import { Encoder, EncoderError } from "./encoder.ts";
import { booleanFlag, Decoder, DecoderError } from "./decoder.ts";

/**
 * PublishPacket is used to send data from client to server and
 * from server to subscribers
 */
export type PublishPacket = {
  type: TPacketType;
  topic: Topic;
  payload: Payload;
  dup?: Dup;
  retain?: boolean;
  qos?: QoS;
  id?: number;
};

export const publish: {
  encode(packet: PublishPacket): Uint8Array;
  decode(
    buffer: Uint8Array,
    flags: number,
    protocolLevel: ProtocolLevel,
  ): PublishPacket;
} = {
  encode(packet: PublishPacket): Uint8Array {
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
    encoder.setRemainder(packet.payload);
    return encoder.done(flags);
  },

  decode(
    buffer: Uint8Array,
    flags: number,
    protocolLevel: ProtocolLevel,
  ): PublishPacket {
    if (protocolLevel === 5) {
      throw new DecoderError("Invalid protocol version");
    }
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
    const payload = decoder.getRemainder();

    // no decoder.done() required because of getRemainder

    return {
      type: PacketType.publish,
      topic,
      payload,
      dup,
      retain,
      qos,
      id,
    };
  },
};
