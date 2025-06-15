import { PacketType } from "./PacketType.ts";
export const PropertyType = {
  byte: 0,
  int16: 1,
  int32: 2,
  varInt: 3,
  byteArray: 4,
  utf8string: 5,
  utf8StringPair: 6,
} as const;

export const Property = {
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

export const PropertyToType: number[] = [];
PropertyToType[Property.payloadFormatIndicator] = PropertyType.byte;
PropertyToType[Property.messageExpiryInterval] = PropertyType.int32;
PropertyToType[Property.contentType] = PropertyType.utf8string;
PropertyToType[Property.responseTopic] = PropertyType.utf8string;
PropertyToType[Property.correlationData] = PropertyType.byteArray;
PropertyToType[Property.subscriptionIdentifier] = PropertyType.varInt;
PropertyToType[Property.sessionExpiryInterval] = PropertyType.int32;
PropertyToType[Property.assignedClientIdentifier] = PropertyType.utf8string;
PropertyToType[Property.serverKeepAlive] = PropertyType.int32;
PropertyToType[Property.authenticationMethod] = PropertyType.utf8string;
PropertyToType[Property.authenticationData] = PropertyType.byteArray;
PropertyToType[Property.requestProblemInformation] = PropertyType.byte;
PropertyToType[Property.willDelayInterval] = PropertyType.int32;
PropertyToType[Property.requestResponseInformation] = PropertyType.byte;
PropertyToType[Property.responseInformation] = PropertyType.utf8string;
PropertyToType[Property.serverReference] = PropertyType.utf8string;
PropertyToType[Property.reasonString] = PropertyType.utf8string;
PropertyToType[Property.receiveMaximum] = PropertyType.int32;
PropertyToType[Property.topicAliasMaximum] = PropertyType.int32;
PropertyToType[Property.topicAlias] = PropertyType.int32;
PropertyToType[Property.maximumQos] = PropertyType.byte;
PropertyToType[Property.retainAvailable] = PropertyType.byte;
PropertyToType[Property.userProperty] = PropertyType.utf8StringPair;
PropertyToType[Property.maximumPacketSize] = PropertyType.int32;
PropertyToType[Property.wildcardSubscriptionAvailable] = PropertyType.byte;
PropertyToType[Property.subscriptionIdentifierAvailable] = PropertyType.byte;
PropertyToType[Property.sharedSubscriptionAvailable] = PropertyType.byte;

export const PropertyByPacketType: number[][] = [];
PropertyByPacketType[PacketType.publish] = [
  Property.payloadFormatIndicator,
  Property.messageExpiryInterval,
  Property.contentType,
  Property.responseTopic,
  Property.correlationData,
  Property.subscriptionIdentifier,
  Property.topicAlias,
  Property.userProperty,
];
//PropertyByPacketType[PacketType.willProperties] = [Property.payloadFormatIndicator,Property.messageExpiryInterval,Property.contentType,Property.responseTopic,Property.correlationData,Property.willDelayInterval,Property.userProperty];
PropertyByPacketType[PacketType.subscribe] = [
  Property.subscriptionIdentifier,
  Property.userProperty,
];
PropertyByPacketType[PacketType.connect] = [
  Property.sessionExpiryInterval,
  Property.authenticationMethod,
  Property.authenticationData,
  Property.requestProblemInformation,
  Property.requestResponseInformation,
  Property.receiveMaximum,
  Property.topicAliasMaximum,
  Property.userProperty,
  Property.maximumPacketSize,
];
PropertyByPacketType[PacketType.connack] = [
  Property.sessionExpiryInterval,
  Property.assignedClientIdentifier,
  Property.serverKeepAlive,
  Property.authenticationMethod,
  Property.authenticationData,
  Property.responseInformation,
  Property.serverReference,
  Property.reasonString,
  Property.receiveMaximum,
  Property.topicAliasMaximum,
  Property.maximumQos,
  Property.retainAvailable,
  Property.userProperty,
  Property.maximumPacketSize,
  Property.wildcardSubscriptionAvailable,
  Property.subscriptionIdentifierAvailable,
  Property.sharedSubscriptionAvailable,
];
PropertyByPacketType[PacketType.disconnect] = [
  Property.sessionExpiryInterval,
  Property.serverReference,
  Property.reasonString,
  Property.userProperty,
];
PropertyByPacketType[PacketType.auth] = [
  Property.authenticationMethod,
  Property.authenticationData,
  Property.reasonString,
  Property.userProperty,
];
PropertyByPacketType[PacketType.puback] = [
  Property.reasonString,
  Property.userProperty,
];
PropertyByPacketType[PacketType.pubrec] = [
  Property.reasonString,
  Property.userProperty,
];
PropertyByPacketType[PacketType.pubrel] = [
  Property.reasonString,
  Property.userProperty,
];
PropertyByPacketType[PacketType.pubcomp] = [
  Property.reasonString,
  Property.userProperty,
];
PropertyByPacketType[PacketType.suback] = [
  Property.reasonString,
  Property.userProperty,
];
PropertyByPacketType[PacketType.unsuback] = [
  Property.reasonString,
  Property.userProperty,
];
PropertyByPacketType[PacketType.unsubscribe] = [Property.userProperty];
