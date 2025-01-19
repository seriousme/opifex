/**
 * @module MQTT Store Types
 */
import type {
  PacketId,
  PublishPacket,
  PubrelPacket,
  SubscribePacket,
  UnsubscribePacket,
} from "./deps.ts";

/**
 * Maximum value for MQTT packet IDs (65535)
 */
export const maxPacketId = 0xffff;

/**
 * Generic type for storing MQTT packets by their packet ID
 * @template T The packet type to store
 */
export type PacketStore<T> = Map<PacketId, T>;

/**
 * Type for incoming PUBLISH packets that are pending processing
 */
export type pendingIncoming = PublishPacket;

/**
 * Type for outgoing packets (PUBLISH, SUBSCRIBE, UNSUBSCRIBE) that are pending sending
 */
export type PendingOutgoing =
  | PublishPacket
  | SubscribePacket
  | UnsubscribePacket;

/**
 * Type for outgoing PUBREL packets that are pending acknowledgement
 */
export type PendingAckOutgoing = PubrelPacket;

/**
 * Union type of all pending outgoing packet types
 */
export type PendingOutgoingPackets = PendingAckOutgoing | PendingOutgoing;

/**
 * Interface defining the storage requirements for MQTT packet state management
 */
export interface IStore {
  /** Store for incoming packets pending processing */
  pendingIncoming: PacketStore<pendingIncoming>;

  /** Store for outgoing packets pending sending */
  pendingOutgoing: PacketStore<PendingOutgoing>;

  /** Store for outgoing packets pending acknowledgement */
  pendingAckOutgoing: PacketStore<PendingAckOutgoing>;

  /**
   * Generator that yields pending outgoing packets
   * @returns AsyncGenerator that yields PendingOutgoing or PubrelPacket packets
   */
  pendingOutgoingPackets(): AsyncGenerator<
    PendingOutgoing | PubrelPacket,
    void,
    unknown
  >;
}
