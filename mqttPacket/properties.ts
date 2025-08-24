import { PacketType } from "./PacketType.ts";
import type { InvertRecord, UTF8StringPair } from "./types.ts";
import type { Encoder } from "./encoder.ts";
import { EncoderError } from "./encoder.ts";
import type { Decoder } from "./decoder.ts";
import { DecoderError } from "./decoder.ts";

export const PropertySetType = {
  ...PacketType,
  will: 100,
} as const;

export type TPropertySetType =
  typeof PropertySetType[keyof typeof PropertySetType];

export const propertyKind = {
  boolean: 0, // its a byte in the MQTT standard, but for convenience we convert to boolean
  byte: 1,
  int16: 2,
  int32: 3,
  varInt: 4,
  byteArray: 5,
  utf8string: 6,
  utf8StringPairs: 7,
} as const;

export const propertyToId = {
  payloadFormatIndicator: 0x01,
  messageExpiryInterval: 0x02,
  contentType: 0x03,
  responseTopic: 0x08,
  correlationData: 0x09,
  subscriptionIdentifier: 0x0b,
  sessionExpiryInterval: 0x11,
  assignedClientIdentifier: 0x12,
  serverKeepAlive: 0x13,
  authenticationMethod: 0x15,
  authenticationData: 0x16,
  requestProblemInformation: 0x17,
  willDelayInterval: 0x18,
  requestResponseInformation: 0x19,
  responseInformation: 0x1a,
  serverReference: 0x1c,
  reasonString: 0x1f,
  receiveMaximum: 0x21,
  topicAliasMaximum: 0x22,
  topicAlias: 0x23,
  maximumQos: 0x24,
  retainAvailable: 0x25,
  userProperty: 0x26,
  maximumPacketSize: 0x27,
  wildcardSubscriptionAvailable: 0x28,
  subscriptionIdentifierAvailable: 0x29,
  sharedSubscriptionAvailable: 0x2a,
} as const;

type PropertyNames = keyof typeof propertyToId;
// A helper type to convert a tuple of numbers to a union of strings

export const propertyToKind = {
  [propertyToId.payloadFormatIndicator]: propertyKind.byte,
  [propertyToId.messageExpiryInterval]: propertyKind.int32,
  [propertyToId.contentType]: propertyKind.utf8string,
  [propertyToId.responseTopic]: propertyKind.utf8string,
  [propertyToId.correlationData]: propertyKind.byteArray,
  [propertyToId.subscriptionIdentifier]: propertyKind.varInt,
  [propertyToId.sessionExpiryInterval]: propertyKind.int32,
  [propertyToId.assignedClientIdentifier]: propertyKind.utf8string,
  [propertyToId.serverKeepAlive]: propertyKind.int32,
  [propertyToId.authenticationMethod]: propertyKind.utf8string,
  [propertyToId.authenticationData]: propertyKind.byteArray,
  [propertyToId.requestProblemInformation]: propertyKind.boolean,
  [propertyToId.willDelayInterval]: propertyKind.int32,
  [propertyToId.requestResponseInformation]: propertyKind.boolean,
  [propertyToId.responseInformation]: propertyKind.utf8string,
  [propertyToId.serverReference]: propertyKind.utf8string,
  [propertyToId.reasonString]: propertyKind.utf8string,
  [propertyToId.receiveMaximum]: propertyKind.int32,
  [propertyToId.topicAliasMaximum]: propertyKind.int32,
  [propertyToId.topicAlias]: propertyKind.int32,
  [propertyToId.maximumQos]: propertyKind.byte,
  [propertyToId.retainAvailable]: propertyKind.boolean,
  [propertyToId.userProperty]: propertyKind.utf8StringPairs,
  [propertyToId.maximumPacketSize]: propertyKind.int32,
  [propertyToId.wildcardSubscriptionAvailable]: propertyKind.boolean,
  [propertyToId.subscriptionIdentifierAvailable]: propertyKind.boolean,
  [propertyToId.sharedSubscriptionAvailable]: propertyKind.boolean,
} as const;

export type UserPropertyType = UTF8StringPair[];

type PropertyKindMap = {
  [propertyKind.boolean]: boolean;
  [propertyKind.byte]: number;
  [propertyKind.int16]: number;
  [propertyKind.int32]: number;
  [propertyKind.varInt]: number;
  [propertyKind.byteArray]: Uint8Array;
  [propertyKind.utf8string]: string;
  [propertyKind.utf8StringPairs]: UserPropertyType;
};

type Mqttv5PropertyType<K extends number> = K extends keyof PropertyKindMap
  ? PropertyKindMap[K]
  : never;

type Mqttv5PropertyTypes = PropertyKindMap[keyof PropertyKindMap];
type Mqttv5PropertyTypesNoUser = Exclude<Mqttv5PropertyTypes, UserPropertyType>;

// First, create a type for all valid property numbers
type ValidPropertyNumber = (typeof propertyToId)[keyof typeof propertyToId];
// Then, create a mapped type that iterates over the property names
// and uses propertyToKind to look up the correct TypeScript type.

type AllMqttv5Properties = {
  [K in PropertyNames]?: Mqttv5PropertyType<
    typeof propertyToKind[typeof propertyToId[K]]
  >;
};

type PropertyByNumberType = InvertRecord<typeof propertyToId>;

export const propertyByNumber = Object.fromEntries(
  Object.entries(propertyToId).map(
    ([k, v]) => [v, k],
  ),
) as PropertyByNumberType;

export const PropertyByPropertySetType = {
  [PropertySetType.reserved]: [],
  [PropertySetType.connect]: [
    propertyToId.sessionExpiryInterval,
    propertyToId.authenticationMethod,
    propertyToId.authenticationData,
    propertyToId.requestProblemInformation,
    propertyToId.requestResponseInformation,
    propertyToId.receiveMaximum,
    propertyToId.topicAliasMaximum,
    propertyToId.userProperty,
    propertyToId.maximumPacketSize,
  ],
  [PropertySetType.connack]: [
    propertyToId.sessionExpiryInterval,
    propertyToId.assignedClientIdentifier,
    propertyToId.serverKeepAlive,
    propertyToId.authenticationMethod,
    propertyToId.authenticationData,
    propertyToId.responseInformation,
    propertyToId.serverReference,
    propertyToId.reasonString,
    propertyToId.receiveMaximum,
    propertyToId.topicAliasMaximum,
    propertyToId.maximumQos,
    propertyToId.retainAvailable,
    propertyToId.userProperty,
    propertyToId.maximumPacketSize,
    propertyToId.wildcardSubscriptionAvailable,
    propertyToId.subscriptionIdentifierAvailable,
    propertyToId.sharedSubscriptionAvailable,
  ],
  [PropertySetType.publish]: [
    propertyToId.payloadFormatIndicator,
    propertyToId.messageExpiryInterval,
    propertyToId.contentType,
    propertyToId.responseTopic,
    propertyToId.correlationData,
    propertyToId.subscriptionIdentifier,
    propertyToId.topicAlias,
    propertyToId.userProperty,
  ],
  [PropertySetType.subscribe]: [
    propertyToId.subscriptionIdentifier,
    propertyToId.userProperty,
  ],

  [PropertySetType.disconnect]: [
    propertyToId.sessionExpiryInterval,
    propertyToId.serverReference,
    propertyToId.reasonString,
    propertyToId.userProperty,
  ],
  [PropertySetType.auth]: [
    propertyToId.authenticationMethod,
    propertyToId.authenticationData,
    propertyToId.reasonString,
    propertyToId.userProperty,
  ],
  [PropertySetType.puback]: [
    propertyToId.reasonString,
    propertyToId.userProperty,
  ],
  [PropertySetType.pubrec]: [
    propertyToId.reasonString,
    propertyToId.userProperty,
  ],
  [PropertySetType.pubrel]: [
    propertyToId.reasonString,
    propertyToId.userProperty,
  ],
  [PropertySetType.pubcomp]: [
    propertyToId.reasonString,
    propertyToId.userProperty,
  ],
  [PropertySetType.suback]: [
    propertyToId.reasonString,
    propertyToId.userProperty,
  ],
  [PropertySetType.unsuback]: [
    propertyToId.reasonString,
    propertyToId.userProperty,
  ],
  [PropertySetType.pingreq]: [],
  [PropertySetType.pingres]: [],
  [PropertySetType.unsubscribe]: [
    propertyToId.userProperty,
  ],
  [PropertySetType.will]: [
    propertyToId.payloadFormatIndicator,
    propertyToId.messageExpiryInterval,
    propertyToId.contentType,
    propertyToId.responseTopic,
    propertyToId.correlationData,
    propertyToId.willDelayInterval,
    propertyToId.userProperty,
  ],
} as const;

// helper types
type PropertyIdsToKeys<T extends readonly ValidPropertyNumber[]> = {
  [K in T[number]]: (typeof propertyByNumber)[K];
}[T[number]];

// from AllMqttv5Properties pick the ones returned by PropertyIdsToKeys for this type
type GeneratePacketTypeProperties<T extends readonly ValidPropertyNumber[]> =
  Pick<AllMqttv5Properties, PropertyIdsToKeys<T>>;

type PropsByPacketSetType = {
  [K in TPropertySetType]: GeneratePacketTypeProperties<
    typeof PropertyByPropertySetType[K]
  >;
};

// props per PacketType
export type ConnectProperties =
  PropsByPacketSetType[typeof PropertySetType.connect];
export type ConnackProperties =
  PropsByPacketSetType[typeof PropertySetType.connack];
export type PublishProperties =
  PropsByPacketSetType[typeof PropertySetType.publish];
export type PubackProperties =
  PropsByPacketSetType[typeof PropertySetType.puback];
export type PubrecProperties =
  PropsByPacketSetType[typeof PropertySetType.pubrec];
export type PubrelProperties =
  PropsByPacketSetType[typeof PropertySetType.pubrel];
export type PubcompProperties =
  PropsByPacketSetType[typeof PropertySetType.pubcomp];
export type SubscribeProperties =
  PropsByPacketSetType[typeof PropertySetType.subscribe];
export type SubackProperties =
  PropsByPacketSetType[typeof PropertySetType.suback];
export type UnsubscribeProperties =
  PropsByPacketSetType[typeof PropertySetType.unsubscribe];
export type UnsubackProperties =
  PropsByPacketSetType[typeof PropertySetType.unsuback];
export type DisconnectProperties =
  PropsByPacketSetType[typeof PropertySetType.disconnect];
export type AuthProperties = PropsByPacketSetType[typeof PropertySetType.auth];

function encodeProperty(
  encoder: Encoder,
  id: ValidPropertyNumber,
  value: Mqttv5PropertyTypes,
) {
  const kind = propertyToKind[id];
  if (kind === propertyKind.utf8StringPairs) {
    if (typeof value !== "object") {
      throw new EncoderError("userProperty must be an object");
    }
    for (const item of Object.entries(value) as UserPropertyType) {
      encoder.setVariableByteInteger(id);
      encoder.setUtf8StringPair(item);
    }
    return;
  }

  encoder.setVariableByteInteger(id);
  switch (kind) {
    case propertyKind.boolean:
      encoder.setByte(!!value === true ? 1 : 0);
      break;
    case propertyKind.byte:
      encoder.setByte(value as number);
      break;
    case propertyKind.int32:
      encoder.setInt32(value as number);
      break;
    case propertyKind.varInt:
      encoder.setVariableByteInteger(value as number);
      break;
    case propertyKind.byteArray:
      encoder.setByteArray(value as Uint8Array);
      break;
    case propertyKind.utf8string:
      encoder.setUtf8String(value as string);
      break;
  }
}
export function encodeProperties<T extends TPropertySetType>(
  props: PropsByPacketSetType[T],
  propertySetType: TPropertySetType,
  encoder: Encoder,
  maximumPacketSize: number,
) {
  const allowedProps = PropertyByPropertySetType[propertySetType];

  for (const id of allowedProps) {
    const label = propertyByNumber[id] as keyof PropsByPacketSetType[T];
    const value = props[label];
    if (value !== undefined && value !== null) {
      if (
        id === propertyToId.reasonString || id === propertyToId.userProperty
      ) {
        encoder.setMarker();
        encodeProperty(encoder, id, value as Mqttv5PropertyTypes);
        if (encoder.encodedSize() > maximumPacketSize) {
          encoder.rewindToMarker();
        }
      } else {
        encodeProperty(encoder, id, value as Mqttv5PropertyTypes);
      }
    }
  }
}

function decodeProperty(
  decoder: Decoder,
  id: ValidPropertyNumber,
): Mqttv5PropertyTypesNoUser {
  switch (propertyToKind[id]) {
    case propertyKind.boolean:
      return !!decoder.getByte();
    case propertyKind.byte:
      return decoder.getByte();
    case propertyKind.int32:
      return decoder.getInt32();
    case propertyKind.varInt:
      return decoder.getVariableByteInteger();
    case propertyKind.byteArray:
      return decoder.getByteArray();
    case propertyKind.utf8string:
      return decoder.getUTF8String();
  }
  // deno-coverage-ignore
  throw new DecoderError("Invalid property kind");
}

export function decodeProperties<T extends keyof PropsByPacketSetType>(
  propertySetType: T,
  decoder: Decoder,
): PropsByPacketSetType[T] {
  const allowedProps = PropertyByPropertySetType[propertySetType];

  const properties = {} as PropsByPacketSetType[T];
  const propLength = decoder.getVariableByteInteger();
  const endPos = decoder.pos + propLength;
  const userProps: Record<string, string> = {};
  let hasUserProps = false;

  while (decoder.pos < endPos) {
    const id = decoder.getVariableByteInteger() as ValidPropertyNumber;
    const label = propertyByNumber[id];
    if (!(allowedProps as readonly number[]).includes(id)) {
      throw new DecoderError(`Property type ${label ? label : id} not allowed`);
    }
    if (label !== "userProperty") {
      const value = decodeProperty(decoder, id);
      // deno-lint-ignore no-explicit-any
      if ((properties as any)[label] !== undefined) {
        throw new DecoderError(`Property ${label} only allowed once`);
      } else {
        // deno-lint-ignore no-explicit-any
        (properties as any)[label] = value;
      }
    } else {
      const [key, value] = decoder.getUTF8StringPair();
      userProps[key] = value;
      hasUserProps = true;
    }
  }
  if (hasUserProps) {
    // deno-lint-ignore no-explicit-any
    (properties as any).userProperty = userProps;
  }
  return properties;
}
