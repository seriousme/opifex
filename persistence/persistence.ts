import { ClientId, PublishPacket, QoS, Subscription, Topic } from "./deps.ts";
import { Store } from "./store.ts";

export type Handler = Function;

export type RetainStore = Map<
  Topic,
  PublishPacket
>;

export type Client = { store: Store; handler: Handler };

export interface Persistence {
  clientList: Map<ClientId, Client>;
  retained: RetainStore;
  registerClient(clientId: ClientId, handler: Handler, clean: boolean): Store;
  deregisterClient(clientId: ClientId): void;
  publish(topic: Topic, packet: PublishPacket): void;
  subscribe(store: Store, topic: Topic, qos: QoS): void;
  unsubscribe(store: Store, topic: Topic): void;
  handleRetained(clientId: ClientId): void;
}
