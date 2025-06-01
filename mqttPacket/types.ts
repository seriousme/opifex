import type { BitMask } from "./BitMask.ts";
import type { PacketType } from "./PacketType.ts";
import type { AuthenticationResult } from "./AuthenticationResult.ts";

/**
 * Type to limit bit mask to valid values
 */
export type TBitMask = typeof BitMask[keyof typeof BitMask];
/**
 * Type to limit packet type to valid values
 */
export type TPacketType = typeof PacketType[keyof typeof PacketType];

/**
 * Type to limit authentication result to valid values
 */
export type TAuthenticationResult =
  typeof AuthenticationResult[keyof typeof AuthenticationResult];

/**
 * Protocol version
 * 3.1 = 3
 * 3.1.1 = 4
 * 5.0 = 5
 */
export type ProtocolLevel = 3 | 4 | 5 | undefined;

/**
 * Quality of Service level
 */
export type QoS = 0 | 1 | 2;

/**
 * Packet payload
 */
export type Payload = Uint8Array;

/**
 * The MQTT topic to publish to
 */
export type Topic = string;

/**
 * The MQTT topic to subscribe/unsubscribe to
 */
export type TopicFilter = string;

/**
 * Duplicate delivery flag
 */
export type Dup = boolean;

/**
 * Packet identifier, unique per client session
 */
export type PacketId = number;

/**
 * Return codes on to describe result of subscribe operation
 */
export type ReturnCodes = number[];

/**
 * Client identifier that uniquely identifies a client
 */
export type ClientId = string;
