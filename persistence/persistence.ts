import { ClientId, PublishPacket, QoS, Topic } from "./deps.ts";
import { IStore } from "./store.ts";

export type Handler = (packet: PublishPacket) => void;

export type RetainStore = Map<
  Topic,
  PublishPacket
>;

export type Client = { store: IStore; handler: Handler };

export interface IPersistence {
  clientList: Map<ClientId, Client>;
  retained: RetainStore;
  registerClient(clientId: ClientId, handler: Handler, clean: boolean): IStore;
  deregisterClient(clientId: ClientId): void;
  publish(topic: Topic, packet: PublishPacket): void;
  subscribe(store: IStore, topic: Topic, qos: QoS): void;
  unsubscribe(store: IStore, topic: Topic): void;
  handleRetained(clientId: ClientId): void;
}
