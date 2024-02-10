import { ClientId, PacketId, PublishPacket, QoS, Topic } from "./deps.ts";

export type PacketStore = Map<PacketId, PublishPacket>;

export type SubscriptionStore = Map<Topic, QoS>;

export interface IStore {
	clientId: ClientId;
	pendingIncoming: PacketStore;
	pendingOutgoing: PacketStore;
	pendingAckOutgoing: Set<PacketId>;
	subscriptions: SubscriptionStore;
	nextId(): PacketId;
}
