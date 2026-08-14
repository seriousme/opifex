import { PacketType } from "./PacketType.ts";
import type { InvertRecord, UTF8StringPair } from "./types.ts";

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
  varIntArray: 8,
} as const;

export const propertyToId = {
  payloadFormatIndicator: 0x01,
  messageExpiryInterval: 0x02,
  contentType: 0x03,
  responseTopic: 0x08,
  correlationData: 0x09,
  subscriptionIdentifier: 0x0b,
  // special case,placeholder to encode decode multiple subscription identifiers
  subscriptionIdentifiers: 0xff,
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
  [propertyToId.payloadFormatIndicator]: propertyKind.boolean,
  [propertyToId.messageExpiryInterval]: propertyKind.int32,
  [propertyToId.contentType]: propertyKind.utf8string,
  [propertyToId.responseTopic]: propertyKind.utf8string,
  [propertyToId.correlationData]: propertyKind.byteArray,
  [propertyToId.subscriptionIdentifier]: propertyKind.varInt,
  [propertyToId.subscriptionIdentifiers]: propertyKind.varIntArray,
  [propertyToId.sessionExpiryInterval]: propertyKind.int32,
  [propertyToId.assignedClientIdentifier]: propertyKind.utf8string,
  [propertyToId.serverKeepAlive]: propertyKind.int16,
  [propertyToId.authenticationMethod]: propertyKind.utf8string,
  [propertyToId.authenticationData]: propertyKind.byteArray,
  [propertyToId.requestProblemInformation]: propertyKind.boolean,
  [propertyToId.willDelayInterval]: propertyKind.int32,
  [propertyToId.requestResponseInformation]: propertyKind.boolean,
  [propertyToId.responseInformation]: propertyKind.utf8string,
  [propertyToId.serverReference]: propertyKind.utf8string,
  [propertyToId.reasonString]: propertyKind.utf8string,
  [propertyToId.receiveMaximum]: propertyKind.int16,
  [propertyToId.topicAliasMaximum]: propertyKind.int16,
  [propertyToId.topicAlias]: propertyKind.int16,
  [propertyToId.maximumQos]: propertyKind.byte,
  [propertyToId.retainAvailable]: propertyKind.boolean,
  [propertyToId.userProperty]: propertyKind.utf8StringPairs,
  [propertyToId.maximumPacketSize]: propertyKind.int32,
  [propertyToId.wildcardSubscriptionAvailable]: propertyKind.boolean,
  [propertyToId.subscriptionIdentifierAvailable]: propertyKind.boolean,
  [propertyToId.sharedSubscriptionAvailable]: propertyKind.boolean,
} as const;

export type UserPropertyType = Array<UTF8StringPair>;
export type SubscriptionIdentifiersType = Array<number>;

type PropertyKindMap = {
  [propertyKind.boolean]: boolean;
  [propertyKind.byte]: number;
  [propertyKind.int16]: number;
  [propertyKind.int32]: number;
  [propertyKind.varInt]: number;
  [propertyKind.byteArray]: Uint8Array;
  [propertyKind.utf8string]: string;
  [propertyKind.utf8StringPairs]: UserPropertyType;
  [propertyKind.varIntArray]: SubscriptionIdentifiersType;
};

type Mqttv5PropertyType<K extends number> = K extends keyof PropertyKindMap
  ? PropertyKindMap[K]
  : never;

export type Mqttv5PropertyTypes = PropertyKindMap[keyof PropertyKindMap];
export type Mqttv5PropertyTypesNoUser = Exclude<
  Mqttv5PropertyTypes,
  UserPropertyType
>;

// First, create a type for all valid property numbers
export type ValidPropertyNumber =
  (typeof propertyToId)[keyof typeof propertyToId];
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
    propertyToId.subscriptionIdentifiers,
    propertyToId.topicAlias,
    propertyToId.userProperty,
  ],
  [PropertySetType.subscribe]: [
    propertyToId.subscriptionIdentifier,
    propertyToId.userProperty,
  ],
  [PropertySetType.unsubscribe]: [
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

export type PropsByPacketSetType = {
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
export type WillProperties = PropsByPacketSetType[typeof PropertySetType.will];
