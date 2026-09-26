import type { BitMask } from "./BitMask.ts";
import type { ProtocolLevel } from "./protocolLevels.ts";

/**
 * Type to limit bit mask to valid values
 */
export type BitMask = typeof BitMask[keyof typeof BitMask];

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

/**
 * UTF8 string pair (for v5)
 */
export type UTF8StringPair = [string, string];

/**
 * Options for the codec
 */
export type CodecOpts = {
  protocolLevel: ProtocolLevel;
  maxIncomingPacketSize: number;
  maxOutgoingPacketSize: number;
};

/**
 * Typescript helper to create an inverted record type
 */
export type InvertRecord<R extends Record<string, number>> = {
  [K in keyof R as R[K]]: K;
};
