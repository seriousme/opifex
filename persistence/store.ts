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

export type IPacketStore = IBaseStore<PacketId, PublishPacket>;
export type ISubscriptionStore = IBaseStore<TopicFilter, QoS>;

export interface IBaseStore<K, V> {
  readonly size: number;
  set(key: K, value: V): this;
  get(key: K): V | undefined;
  has(key: K): boolean;
  delete(key: K): boolean;
  clear(): void;
  keys(): IterableIterator<K>;
}

export interface IPacketIdStore {
  readonly size: number;
  add(key: PacketId): this;
  has(key: PacketId): boolean;
  delete(key: PacketId): boolean;
  clear(): void;
  keys(): IterableIterator<PacketId>;
}
