/**
 *  Possible MQTT V5 reason codes
 */

import { PacketType } from "./PacketType.ts";
import type { InvertRecord } from "./types.ts";

export const ReasonCode = {
  success: 0x00,
  normalDisconnection: 0x00,
  grantedQos0: 0x00,
  grantedQos1: 0x01,
  grantedQos2: 0x02,
  disconnectWithWillMessage: 0x04,
  noMatchingSubscribers: 0x10,
  noSubscriptionExisted: 0x11,
  continueAuthentication: 0x18,
  reAuthenticate: 0x19,
  unspecifiedError: 0x80,
  malformedPacket: 0x81,
  protocolError: 0x82,
  implementationSpecificError: 0x83,
  unsupportedProtocolVersion: 0x84,
  clientIdentifierNotValid: 0x85,
  badUserNameOrPassword: 0x86,
  notAuthorized: 0x87,
  serverUnavailable: 0x88,
  serverBusy: 0x89,
  banned: 0x8a,
  serverShuttingDown: 0x8b,
  badAuthenticationMethod: 0x8c,
  keepAliveTimeout: 0x8d,
  sessionTakenOver: 0x8e,
  topicFilterInvalid: 0x8f,
  topicNameInvalid: 0x90,
  packetIdentifierInUse: 0x91,
  packetIdentifierNotFound: 0x92,
  receiveMaximumExceeded: 0x93,
  topicAliasInvalid: 0x94,
  packetTooLarge: 0x95,
  messageRateTooHigh: 0x96,
  quotaExceeded: 0x97,
  administrativeAction: 0x98,
  payloadFormatInvalid: 0x99,
  retainNotSupported: 0x9a,
  qosNotSupported: 0x9b,
  useAnotherServer: 0x9c,
  serverMoved: 0x9d,
  sharedSubscriptionsNotSupported: 0x9e,
  connectionRateExceeded: 0x9f,
  maximumConnectTime: 0xa0,
  subscriptionIdentifiersNotSupported: 0xa1,
  wildcardSubscriptionsNotSupported: 0xa2,
} as const;

/**
 * Reverse lookup for ReasonCode
 */

export type ReasonCodeByNumberType = InvertRecord<typeof ReasonCode>;
export const ReasonCodeByNumber = Object
  .fromEntries(
    Object.entries(ReasonCode).map(([k, v]) => [v, k]),
  ) as ReasonCodeByNumberType;

export const ReasonCodebyPacket ={
[PacketType.connack]:[
  ReasonCode.success,
  ReasonCode.unspecifiedError,
  ReasonCode.malformedPacket,
  ReasonCode.protocolError,
  ReasonCode.implementationSpecificError,
  ReasonCode.unsupportedProtocolVersion,
  ReasonCode.clientIdentifierNotValid,
  ReasonCode.badUserNameOrPassword,
  ReasonCode.notAuthorized,
  ReasonCode.serverUnavailable,
  ReasonCode.serverBusy,
  ReasonCode.banned,
  ReasonCode.badAuthenticationMethod,
  ReasonCode.topicNameInvalid,
  ReasonCode.packetTooLarge,
  ReasonCode.quotaExceeded,
  ReasonCode.payloadFormatInvalid,
  ReasonCode.retainNotSupported,
  ReasonCode.qosNotSupported,
  ReasonCode.useAnotherServer,
  ReasonCode.serverMoved,
  ReasonCode.connectionRateExceeded,
],
[PacketType.puback]:[
  ReasonCode.success,
  ReasonCode.noMatchingSubscribers,
  ReasonCode.unspecifiedError,
  ReasonCode.implementationSpecificError,
  ReasonCode.notAuthorized,
  ReasonCode.topicNameInvalid,
  ReasonCode.packetIdentifierInUse,
  ReasonCode.quotaExceeded,
  ReasonCode.payloadFormatInvalid,
],
[PacketType.pubrec]:[
  ReasonCode.success,
  ReasonCode.noMatchingSubscribers,
  ReasonCode.unspecifiedError,
  ReasonCode.implementationSpecificError,
  ReasonCode.notAuthorized,
  ReasonCode.topicNameInvalid,
  ReasonCode.packetIdentifierInUse,
  ReasonCode.quotaExceeded,
  ReasonCode.payloadFormatInvalid,
],
[PacketType.pubrel]:[
  ReasonCode.success,
  ReasonCode.packetIdentifierNotFound,
],
[PacketType.pubcomp]:[
  ReasonCode.success,
  ReasonCode.packetIdentifierNotFound,
],
[PacketType.unsuback]:[
  ReasonCode.success,
  ReasonCode.noSubscriptionExisted,
  ReasonCode.unspecifiedError,
  ReasonCode.implementationSpecificError,
  ReasonCode.notAuthorized,
  ReasonCode.topicFilterInvalid,
  ReasonCode.packetIdentifierInUse,
],
[PacketType.auth]:[
  ReasonCode.success,
  ReasonCode.continueAuthentication,
  ReasonCode.reAuthenticate,
],
[PacketType.disconnect]:[
  ReasonCode.normalDisconnection,
  ReasonCode.disconnectWithWillMessage,
  ReasonCode.unspecifiedError,
  ReasonCode.malformedPacket,
  ReasonCode.protocolError,
  ReasonCode.implementationSpecificError,
  ReasonCode.notAuthorized,
  ReasonCode.serverBusy,
  ReasonCode.serverShuttingDown,
  ReasonCode.badAuthenticationMethod,
  ReasonCode.keepAliveTimeout,
  ReasonCode.sessionTakenOver,
  ReasonCode.topicFilterInvalid,
  ReasonCode.topicNameInvalid,
  ReasonCode.receiveMaximumExceeded,
  ReasonCode.topicAliasInvalid,
  ReasonCode.packetTooLarge,
  ReasonCode.messageRateTooHigh,
  ReasonCode.quotaExceeded,
  ReasonCode.administrativeAction,
  ReasonCode.payloadFormatInvalid,
  ReasonCode.retainNotSupported,
  ReasonCode.qosNotSupported,
  ReasonCode.useAnotherServer,
  ReasonCode.serverMoved,
  ReasonCode.sharedSubscriptionsNotSupported,
  ReasonCode.connectionRateExceeded,
  ReasonCode.maximumConnectTime,
  ReasonCode.subscriptionIdentifiersNotSupported,
  ReasonCode.wildcardSubscriptionsNotSupported,
],
[PacketType.suback]:[
  ReasonCode.grantedQos0,
  ReasonCode.grantedQos1,
  ReasonCode.grantedQos2,
  ReasonCode.unspecifiedError,
  ReasonCode.implementationSpecificError,
  ReasonCode.notAuthorized,
  ReasonCode.topicFilterInvalid,
  ReasonCode.packetIdentifierInUse,
  ReasonCode.quotaExceeded,
  ReasonCode.sharedSubscriptionsNotSupported,
  ReasonCode.subscriptionIdentifiersNotSupported,
  ReasonCode.wildcardSubscriptionsNotSupported,
]
} as const;

const reasonCodesToString={
[0x00] : "Success",
[0x01] : "Granted QoS 1",
[0x02] : "Granted QoS 2",
[0x04] : "Disconnect with Will Message",
[0x10] : "No matching subscribers",
[0x11] : "No subscription existed",
[0x18] : "Continue authentication",
[0x19] : "Re-authenticate",
[0x80] : "Unspecified error",
[0x81] : "Malformed Packet",
[0x82] : "Protocol Error",
[0x83] : "Implementation specific error",
[0x84] : "Unsupported Protocol Version",
[0x85] : "Client Identifier not valid",
[0x86] : "Bad User Name or Password",
[0x87] : "Not authorized",
[0x88] : "Server unavailable",
[0x89] : "Server busy",
[0x8a] : "Banned",
[0x8b] : "Server shutting down",
[0x8c] : "Bad authentication method",
[0x8d] : "Keep Alive timeout",
[0x8e] : "Session taken over",
[0x8f] : "Topic Filter invalid",
[0x90] : "Topic Name invalid",
[0x91] : "Packet Identifier in use",
[0x92] : "Packet Identifier not found",
[0x93] : "Receive Maximum exceeded",
[0x94] : "Topic Alias invalid",
[0x95] : "Packet too large",
[0x96] : "Message rate too high",
[0x97] : "Quota exceeded",
[0x98] : "Administrative action",
[0x99] : "Payload format invalid",
[0x9a] : "Retain not supported",
[0x9b] : "QoS not supported",
[0x9c] : "Use another server",
[0x9d] : "Server moved",
[0x9e] : "Shared Subscriptions not supported",
[0x9f] : "Connection rate exceeded",
[0xa0] : "Maximum connect time",
[0xa1] : "Subscription Identifiers not supported",
[0xa2] : "Wildcard Subscriptions not supported",
} as const;

// Can't import this from types as this would create an import loop
type TPacketType = typeof PacketType[keyof typeof PacketType];
type TReasonCode = typeof ReasonCode[keyof typeof ReasonCode];

export function reasonCodeToString(
  packetType: TPacketType,
  code: TReasonCode,
): string {
  if (code === 0) {
    if (packetType === PacketType.disconnect) {
      return "Normal disconnection";
    }
    if (packetType === PacketType.suback) {
      return "Granted QoS 0";
    }
  }
  return reasonCodesToString[code];
}
