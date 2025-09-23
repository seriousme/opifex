import type {
  ClientId,
  CodecOpts,
  Payload,
  ProtocolLevel,
  ProtocolLevelNoV5,
  QoS,
  Topic,
  TPacketType,
} from "./types.ts";
import type { ConnectProperties, WillProperties } from "./Properties.ts";
import { PropertySetType } from "./Properties.ts";
import { PacketType } from "./PacketType.ts";
import { BitMask } from "./BitMask.ts";
import { Encoder, EncoderError } from "./encoder.ts";
import {
  booleanFlag,
  Decoder,
  DecoderError,
  hasEmptyFlags,
} from "./decoder.ts";

/**
 * ConnectPacket is sent from the client to the server to initiate a connection.
 */
export type ConnectPacketV4 = {
  type: TPacketType;
  protocolName?: string;
  protocolLevel: ProtocolLevelNoV5;
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
  bridgeMode?: boolean;
};

export type ConnectPacketV5 = {
  type: TPacketType;
  protocolName?: string;
  protocolLevel: 5;
  clientId?: ClientId;
  username?: string;
  password?: Uint8Array;
  will?: {
    topic: Topic;
    payload: Payload;
    retain?: boolean;
    qos?: QoS;
    properties?: WillProperties;
  };
  clean?: boolean;
  keepAlive?: number;
  bridgeMode?: boolean;
  properties?: ConnectProperties;
};

export type ConnectPacket = ConnectPacketV4 | ConnectPacketV5;

function invalidProtocolName(version: number, name: string): boolean {
  if (version === 3 && name === "MQIsdp") {
    return false;
  }
  if (version === 4 && name === "MQTT") {
    return false;
  }
  if (version === 5 && name == "MQTT") {
    return false;
  }
  return true;
}

export const connect: {
  encode(packet: ConnectPacket, _codecOpts: CodecOpts): Uint8Array;
  decode(
    buffer: Uint8Array,
    flags: number,
    codecOpts: CodecOpts,
    packetType: TPacketType,
  ): ConnectPacket;
} = {
  encode(packet: ConnectPacket, codecOpts: CodecOpts): Uint8Array {
    const flags = 0;

    if (typeof packet.protocolLevel !== "number") {
      throw new EncoderError("Protocol level must be a number");
    }
    const protocolLevel = packet.protocolLevel || 4;
    if (protocolLevel < 3 || protocolLevel > 5) {
      throw new EncoderError("Unsupported protocol level");
    }
    const protocolName = protocolLevel > 3 ? "MQTT" : "MQIsdp";
    const clientId = packet.clientId || "";
    const usernameFlag = packet.username !== undefined;
    if (protocolLevel === 3 && clientId === "") {
      throw new EncoderError("Client id required for protocol level 3");
    }
    const passwordFlag = usernameFlag && packet.password !== undefined;
    const willRetain = !!packet.will?.retain;
    const willQoS = packet.will?.qos || 0;
    const willFlag = packet.will !== undefined;
    if (willFlag) {
      if (packet.will?.topic === undefined) {
        throw new EncoderError("Will topic must be defined");
      }
      if (packet.will?.payload === undefined) {
        throw new EncoderError("Will payload must be defined");
      }
    }
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
    const bridgeMode = !!packet.bridgeMode;
    const rawProtocolLevel = bridgeMode ? protocolLevel + 128 : protocolLevel;

    const encoder = new Encoder(packet.type);
    encoder
      .setUtf8String(protocolName)
      .setByte(rawProtocolLevel)
      .setByte(connectFlags)
      .setInt16(keepAlive);
    if (packet.protocolLevel === 5) {
      encoder.setProperties(
        packet.properties || {},
        PropertySetType.connect,
        codecOpts.maxOutgoingPacketSize,
      );
    }
    encoder.setUtf8String(clientId);

    if (
      packet.will !== undefined && packet.will.topic !== undefined &&
      packet.will.payload !== undefined
    ) {
      if (packet.protocolLevel === 5) {
        encoder.setProperties(
          packet.will?.properties || {},
          PropertySetType.will,
          codecOpts.maxOutgoingPacketSize,
        );
      }
      encoder.setTopic(packet.will.topic).setByteArray(packet.will.payload);
    }

    if (packet.username !== undefined) {
      encoder.setUtf8String(packet.username);
    }

    if (passwordFlag && packet.password !== undefined) {
      encoder.setByteArray(packet.password);
    }
    return encoder.done(flags);
  },

  decode(
    buffer: Uint8Array,
    flags: number,
    _codecOpts: CodecOpts,
    packetType: TPacketType,
  ): ConnectPacket {
    const decoder = new Decoder(packetType, buffer);
    const protocolName = decoder.getUTF8String();
    const rawProtocolLevel = decoder.getByte();
    const bridgeMode = rawProtocolLevel > 128;
    const protocolLevel = bridgeMode
      ? rawProtocolLevel - 128
      : rawProtocolLevel;

    if (invalidProtocolName(protocolLevel, protocolName)) {
      throw new DecoderError("Invalid protocol name or level");
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

    if (!usernameFlag && passwordFlag) {
      throw new DecoderError("Password without username");
    }

    const keepAlive = decoder.getInt16();
    const isV5 = protocolLevel === 5;
    let properties;
    if (isV5) {
      properties = decoder.getProperties(PropertySetType.connect);
    }
    const clientId = decoder.getUTF8String();
    let willProperties;
    let willTopic;
    let willPayload;
    if (willFlag) {
      if (isV5) {
        willProperties = decoder.getProperties(PropertySetType.will);
      }
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

    let bridgeModeProp = {};
    if (bridgeMode) {
      bridgeModeProp = { bridgeMode };
    }
    const commonProps = {
      type: PacketType.connect,
      protocolName: protocolName,
      clientId: clientId,
      username,
      password: password ? password : undefined,
      clean: cleanSession,
      keepAlive,
      ...bridgeModeProp,
    };

    if (isV5) {
      return {
        ...commonProps,
        protocolLevel: 5,
        will: willFlag
          ? {
            topic: willTopic || "",
            payload: willPayload || Uint8Array.from([0]),
            retain: willRetain,
            qos: willQoS,
            properties: willProperties,
          }
          : undefined,
        properties,
      };
    }
    return {
      ...commonProps,
      protocolLevel: protocolLevel as ProtocolLevel,
      will: willFlag
        ? {
          topic: willTopic || "",
          payload: willPayload || Uint8Array.from([0]),
          retain: willRetain,
          qos: willQoS,
        }
        : undefined,
    };
  },
};
