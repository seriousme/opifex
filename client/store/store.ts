import {
  PacketId,
  PublishPacket,
  PubrelPacket,
  SubscribePacket,
  UnsubscribePacket,
} from "./deps.ts";
export const maxPacketId = 0xffff;

export type PacketStore<T> = Map<
  PacketId,
  T
>;

export type pendingIncoming = PublishPacket;
export type PendingOutgoing =
  | PublishPacket
  | SubscribePacket
  | UnsubscribePacket;
export type PendingAckOutgoing = PubrelPacket;
export type PendingOutgoingPackets = PendingAckOutgoing | PendingOutgoing;

export interface Store {
  pendingIncoming: PacketStore<pendingIncoming>;
  pendingOutgoing: PacketStore<PendingOutgoing>;
  pendingAckOutgoing: PacketStore<PendingAckOutgoing>;
  pendingOutgoingPackets(): AsyncGenerator<
    PendingOutgoing | PubrelPacket,
    void,
    unknown
  >;
}
