import type { BitMask } from "./BitMask.ts";
import type { PacketType } from "./PacketType.ts";
import type { AuthenticationResult } from "./AuthenticationResult.ts";

export type TBitMask = typeof BitMask[keyof typeof BitMask];
export type TPacketType = typeof PacketType[keyof typeof PacketType];
export type TAuthenticationResult =
  typeof AuthenticationResult[keyof typeof AuthenticationResult];

export type QoS = 0 | 1 | 2;

export type Payload = Uint8Array;

/**
 * The MQTT topic to publish or subscribe to
 */
export type Topic = string;

export type TopicFilter = string;

export type Dup = boolean;

export type PacketId = number;

export type ReturnCodes = number[];

export type ClientId = string;
