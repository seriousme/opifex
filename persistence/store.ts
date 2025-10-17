import type { ClientId, PacketId, PublishPacket, QoS, Topic } from "./deps.ts";

export type PacketStore = Map<PacketId, PublishPacket>;
export type PacketIdStore = Set<PacketId>;

export type SubscriptionStore = Map<Topic, QoS>;

export interface IStore {
  existingSession: boolean;
  clientId: ClientId;
  pendingIncoming: PacketIdStore;
  pendingOutgoing: PacketStore;
  pendingAckOutgoing: PacketIdStore;
  subscriptions: SubscriptionStore;
  nextId(): PacketId;
}
