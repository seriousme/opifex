import type {
  ClientId,
  CodecOpts,
  Payload,
  ProtocolLevel,
  QoS,
  Topic,
  TPacketType,
} from "./types.ts";
import { PacketType } from "./PacketType.ts";
import { BitMask } from "./BitMask.ts";
import { Encoder,EncoderError } from "./encoder.ts";
import {
  booleanFlag,
  Decoder,
  DecoderError,
  hasEmptyFlags,
} from "./decoder.ts";

/**
 * ConnectPacket is sent from the client to the server to initiate a connection.
 */
export type ConnectPacket = {
  type: TPacketType;
  protocolName?: string;
  protocolLevel?: ProtocolLevel;
  clientId?: ClientId;
  username?: string;
  password?: Uint8Array;
  will?: {
    topic: Topic;
    payload: Payload;
    retain?: boolean;
    qos?: QoS;
  };
  clean?: boolean;
  keepAlive?: number;
};

function invalidProtocolName(version: number, name: string): boolean {
  if (version === 3 && name !== "MQIsdp") {
    return true;
  }
  if (version === 4 && name !== "MQTT") {
    return true;
  }
  if (version === 5 && name !== "MQTT") {
    return true;
  }
  return false;
}

export const connect: {
  encode(packet: ConnectPacket, _codecOpts: CodecOpts): Uint8Array;
  decode(
    buffer: Uint8Array,
    flags: number,
    codecOpts: CodecOpts,
  ): ConnectPacket;
} = {
  encode(packet: ConnectPacket, _codecOpts: CodecOpts): Uint8Array {
    const flags = 0;
    const protocolLevel = packet.protocolLevel || 4;
    if (protocolLevel > 4) {
      throw new EncoderError("Unsupported protocol level");
    }
    const protocolName = protocolLevel > 3 ? "MQTT" : "MQIsdp";
    const clientId = packet.clientId || "";
    const usernameFlag = packet.username !== undefined;
    if (protocolLevel === 3 && clientId === "") {
      throw new EncoderError("Client id required for protocol level 3");
    }
    const passwordFlag = packet.password !== undefined;
    const willRetain = !!packet.will?.retain;
    const willQoS = packet.will?.qos || 0;
    const willFlag = packet.will !== undefined;
    const cleanSession = packet.clean !== false;
    if (!cleanSession && (clientId === "")) {
      throw new EncoderError("Client id required for clean session");
    }
    const connectFlags = (usernameFlag ? BitMask.bit7 : 0) +
      (passwordFlag ? BitMask.bit6 : 0) +
      (willRetain ? BitMask.bit5 : 0) +
      (willQoS & 2 ? BitMask.bit4 : 0) +
      (willQoS & 1 ? BitMask.bit3 : 0) +
      (willFlag ? BitMask.bit2 : 0) +
      (cleanSession ? BitMask.bit1 : 0);
    const keepAlive = packet.keepAlive || 0;

    const encoder = new Encoder(packet.type);
    encoder
      .setUtf8String(protocolName)
      .setByte(protocolLevel)
      .setByte(connectFlags)
      .setInt16(keepAlive)
      .setUtf8String(clientId);

    if (
      packet.will?.topic !== undefined && packet.will?.payload !== undefined
    ) {
      encoder.setTopic(packet.will.topic).setByteArray(packet.will.payload);
    }

    if (packet.username !== undefined) {
      encoder.setUtf8String(packet.username);
    }

    if (packet.password !== undefined) {
      encoder.setByteArray(packet.password);
    }
    return encoder.done(flags);
  },

  decode(
    buffer: Uint8Array,
    flags: number,
    _codecOpts: CodecOpts,
  ): ConnectPacket {
    const decoder = new Decoder(buffer);
    const protocolName = decoder.getUTF8String();
    const protocolLevel = decoder.getByte();
    if (invalidProtocolName(protocolLevel, protocolName)) {
      throw new DecoderError("Invalid protocol name");
    }

    const connectFlags = decoder.getByte();

    const usernameFlag = booleanFlag(connectFlags, BitMask.bit7);
    const passwordFlag = booleanFlag(connectFlags, BitMask.bit6);
    const willRetain = booleanFlag(connectFlags, BitMask.bit5);
    const willQoS = (connectFlags & (BitMask.bit4 + BitMask.bit3)) >> 3;
    const willFlag = booleanFlag(connectFlags, BitMask.bit2);
    const cleanSession = booleanFlag(connectFlags, BitMask.bit1);
    const reservedBit = booleanFlag(connectFlags, BitMask.bit0);

    hasEmptyFlags(flags);
    // The Server MUST validate that the reserved flag in the CONNECT Control Packet
    // is set to zero and disconnect the Client if it is not zero [MQTT-3.1.2-3].
    if (reservedBit) {
      throw new DecoderError("Invalid reserved bit");
    }

    if (willQoS !== 0 && willQoS !== 1 && willQoS !== 2) {
      throw new DecoderError("Invalid will qos");
    }

    const keepAlive = decoder.getInt16();
    const clientId = decoder.getUTF8String();

    let willTopic;
    let willPayload;
    if (willFlag) {
      willTopic = decoder.getTopic();
      willPayload = decoder.getByteArray();
    }

    let username;
    let password;
    if (usernameFlag) {
      username = decoder.getUTF8String();
    }

    if (passwordFlag) {
      password = decoder.getByteArray();
    }

    decoder.done();
    if (!willFlag && (willQoS !== 0 || willRetain === true)) {
      throw new DecoderError(
        "Will QoS must be 0 and Will retain to false when Will flag is false",
      );
    }

    if (clientId.length === 0 && cleanSession === false) {
      throw new DecoderError("Clean session must be true if clientID is empty");
    }

    return {
      type: PacketType.connect,
      protocolName: protocolName,
      protocolLevel: protocolLevel as ProtocolLevel,
      clientId: clientId,
      username: username ? username : undefined,
      password: password ? password : undefined,
      will: willFlag
        ? {
          topic: willTopic || "",
          payload: willPayload || Uint8Array.from([0]),
          retain: willRetain,
          qos: willQoS,
        }
        : undefined,
      clean: cleanSession,
      keepAlive,
    };
  },
};
