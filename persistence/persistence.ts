import { PublishPacket, Subscription } from "../mqttPacket/mod.ts";

export type Handler = Function;
export type { Subscription };

export type Packet = PublishPacket;
export type PacketId = number;

export type ClientId = string;
export enum ClientState {
  online,
  offline,
}

export type QoS = 0 | 1 | 2;

export type Topic = string;

export type PacketStore = Map<
  PacketId,
  Packet
>;

export type SubscriptionStore = Map<
  Topic,
  QoS
>;

export type RetainStore = Map<
  Topic,
  Packet
>;

export interface Persistence {
  clientList: Map<ClientId, Client>;
  retained: RetainStore;
  registerClient(clientId: ClientId, handler: Handler, close: Handler): Client;
  getClient(clientId: ClientId): Client | undefined;
  deregisterClient(clientId: ClientId): void;
  publish(topic: Topic, packet: Packet): void;
  subscribe(client: Client, topic: Topic, qos: QoS): void;
  unsubscribe(client: Client, topic: Topic): void;
  handleRetained(client: Client, subscription: Subscription[]): void;
}

export interface Client {
  id: ClientId;
  state: ClientState;
  incomming: PacketStore;
  outgoing: PacketStore;
  pendingOutgoing: PacketStore;
  pendingAckOutgoing: Set<PacketId>;
  subscriptions: SubscriptionStore;
  nextId(): PacketId;
  handler: Handler;
  close: Handler;
  publish(topic: Topic, packet: Packet): void;
}
