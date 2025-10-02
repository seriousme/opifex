import type {
  Client,
  ClientId,
  Handler,
  IPersistence,
  IStore,
  PacketId,
  PacketStore,
  PublishPacket,
  QoS,
  RetainStore,
  SubscriptionStore,
  Topic,
  TopicFilter,
} from "../mod.ts";

import { maxPacketId } from "../mod.ts";

import { Trie } from "../deps.ts";
import { assert } from "../../utils/mod.ts";

type ClientSubscription = {
  clientId: ClientId;
  qos: QoS;
};

export class MemoryStore implements IStore {
  existingSession: boolean = false;
  clientId: ClientId;
  private packetId: PacketId;
  pendingIncoming: PacketStore;
  pendingOutgoing: PacketStore;
  pendingAckOutgoing: Set<PacketId>;
  subscriptions: SubscriptionStore;

  constructor(clientId: ClientId) {
    this.packetId = 0;
    this.pendingIncoming = new Map();
    this.pendingOutgoing = new Map();
    this.pendingAckOutgoing = new Set();
    this.subscriptions = new Map();
    this.clientId = clientId;
  }

  nextId(): PacketId {
    const currentId = this.packetId;
    do {
      this.packetId++;
      if (this.packetId > maxPacketId) {
        this.packetId = 0;
      }
    } while (
      (this.pendingOutgoing.has(this.packetId) ||
        this.pendingAckOutgoing.has(this.packetId)) &&
      this.packetId !== currentId
    );
    assert(this.packetId !== currentId, "No unused packetId available");
    return this.packetId;
  }
}

export class MemoryPersistence implements IPersistence {
  clientList: Map<ClientId, Client>;
  retained: RetainStore;
  private trie: Trie<ClientSubscription>;

  constructor() {
    this.clientList = new Map();
    this.retained = new Map();
    this.trie = new Trie(true);
  }

  registerClient(clientId: ClientId, handler: Handler, clean: boolean): IStore {
    const existingClient = this.clientList.get(clientId);
    const store = !clean && existingClient
      ? existingClient.store
      : new MemoryStore(clientId);
    this.clientList.set(clientId, { store, handler });
    return store;
  }

  deregisterClient(clientId: ClientId): void {
    const client = this.clientList.get(clientId);
    if (client) {
      this.unsubscribeAll(client.store);
      this.clientList.delete(clientId);
    }
  }

  subscribe(store: IStore, topicFilter: TopicFilter, qos: QoS): void {
    const clientId = store.clientId;
    if (!store.subscriptions.has(topicFilter)) {
      store.subscriptions.set(topicFilter, qos);
      this.trie.add(topicFilter, { clientId, qos });
    }
  }

  unsubscribe(store: IStore, topicFilter: TopicFilter): void {
    const clientId = store.clientId;
    const qos = store.subscriptions.get(topicFilter);
    if (qos !== undefined) {
      store.subscriptions.delete(topicFilter);
      this.trie.remove(topicFilter, { clientId, qos });
    }
  }

  private unsubscribeAll(store: IStore) {
    for (const [topicFilter, _qos] of store.subscriptions) {
      this.unsubscribe(store, topicFilter);
    }
  }

  publish(topic: Topic, packet: PublishPacket): void {
    if (packet.retain) {
      this.retained.set(packet.topic, packet);
      if (packet.payload === undefined) {
        this.retained.delete(packet.topic);
      }
    }

    // dedup clients
    const clients = new Map();
    for (const { clientId, qos } of this.trie.match(topic)) {
      const prevQos = clients.get(clientId);
      if (!prevQos || prevQos < qos) {
        clients.set(clientId, qos);
      }
    }

    // publish the message to all clients
    for (const [clientId, qos] of clients) {
      const newPacket = Object.assign({}, packet);
      newPacket.retain = false;
      newPacket.qos = qos;
      //  logger.debug(`publish ${topic} to client ${clientId}`);
      const client = this.clientList.get(clientId);
      client?.handler(newPacket);
    }
  }

  handleRetained(clientId: ClientId): void {
    const retainedTrie: Trie<ClientId> = new Trie();
    const client = this.clientList.get(clientId);
    const store = client?.store;
    if (store) {
      for (const [topicFilter, _qos] of store.subscriptions) {
        retainedTrie.add(topicFilter, clientId);
      }
      for (const [topic, packet] of this.retained) {
        if (retainedTrie.match(topic).length > 0) {
          client?.handler(packet);
        }
      }
    }
  }
}
