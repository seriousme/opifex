import {
  assert,
  ClientId,
  debug,
  PacketId,
  PublishPacket,
  QoS,
  Topic,
  TopicFilter,
  Trie,
} from "../deps.ts";

import { Client, Handler, Persistence, RetainStore } from "../persistence.ts";
import { PacketStore, Store, SubscriptionStore } from "../store.ts";

const maxPacketId = 0xffff;
const maxQueueLength = 0xffff;

export class MemoryStore implements Store {
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
      (this.packetId !== currentId)
    );
    assert(this.packetId !== currentId, "No unused packetId available");
    return this.packetId;
  }
}

export class MemoryPersistence implements Persistence {
  clientList: Map<ClientId, Client>;
  retained: RetainStore;
  private trie: Trie<ClientId>;

  constructor() {
    this.clientList = new Map();
    this.retained = new Map();
    this.trie = new Trie();
  }

  registerClient(clientId: ClientId, handler: Handler, clean: boolean): Store {
    const existingClient = this.clientList.get(clientId);
    const store = (!clean && existingClient)? existingClient.store:new MemoryStore(clientId);
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

  subscribe(store: Store, topicFilter: TopicFilter, qos: QoS): void {
    if (!store.subscriptions.has(topicFilter)) {
      store.subscriptions.set(topicFilter, qos);
      this.trie.add(topicFilter, store.clientId);
    }
  }

  unsubscribe(store: Store, topic: Topic): void {
    if (store.subscriptions.has(topic)) {
      store.subscriptions.delete(topic);
      this.trie.remove(topic, store.clientId);
    }
  }

  private unsubscribeAll(store: Store) {
    for (const [topic, qos] of store.subscriptions) {
      this.unsubscribe(store, topic);
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
    const clients = new Set(this.trie.match(topic));
    // publish the message to all clients
    for (const clientId of clients) {
      // debug.log(`publish ${topic} to client ${clientId}`);
      const client = this.clientList.get(clientId);
      client?.handler(packet);
    }
  }

  handleRetained(clientId: ClientId): void {
    const retainedTrie: Trie<ClientId> = new Trie();
    const client = this.clientList.get(clientId);
    const store = client?.store;
    if (store) {
      for (const [topicFilter, qos] of store.subscriptions) {
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
