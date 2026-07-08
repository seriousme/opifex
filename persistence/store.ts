import type {
  ClientId,
  PacketId,
  PublishPacket,
  QoS,
  TopicFilter,
} from "./deps.ts";

export interface IStore {
  clientId: ClientId;
  pendingIncoming: IPacketIdStore;
  pendingOutgoing: IPacketStore;
  pendingAckOutgoing: IPacketIdStore;
  subscriptions: ISubscriptionStore;
  nextId(): PacketId | Promise<PacketId>;
}

export interface IPacketStore extends IBaseStore<PacketId, PublishPacket> {
  values(): AsyncIterableIterator<PublishPacket>;
}
export type ISubscriptionStore = IBaseStore<TopicFilter, QoS>;

export interface IBaseStore<K, V> {
  size(): Promise<number>;
  set(key: K, value: V): Promise<void>;
  get(key: K): Promise<V | undefined>;
  has(key: K): Promise<boolean>;
  delete(key: K): Promise<boolean>;
  clear(): Promise<void>;
  keys(): AsyncIterableIterator<K>;
}

export interface IPacketIdStore {
  size(): Promise<number>;
  add(key: PacketId): Promise<void>;
  has(key: PacketId): Promise<boolean>;
  delete(key: PacketId): Promise<boolean>;
  clear(): Promise<void>;
  keys(): AsyncIterableIterator<PacketId>;
}
