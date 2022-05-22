import {
  Client,
  ClientId,
  ClientState,
  Handler,
  Packet,
  PacketId,
  PacketStore,
  Persistence,
  QoS,
  RetainStore,
  Subscription,
  SubscriptionStore,
  Topic,
} from "../persistence.ts";

import { assert, debug, Trie } from "../deps.ts";

const maxPacketId = 0xffff;
const maxQueueLength = 42;

export class MemoryClient implements Client {
  id: ClientId;
  state: ClientState;
  private packetId: PacketId;
  incomming: PacketStore;
  outgoing: PacketStore;
  pendingOutgoing: PacketStore;
  pendingAckOutgoing: Set<PacketId>;
  subscriptions: SubscriptionStore;
  handler: Handler;
  close: Handler;

  constructor(id: ClientId, handler: Handler, close: Handler) {
    this.id = id;
    this.packetId = 0;
    this.state = ClientState.online;
    this.incomming = new Map();
    this.outgoing = new Map();
    this.pendingOutgoing = new Map();
    this.pendingAckOutgoing = new Set();
    this.subscriptions = new Map();
    this.handler = handler;
    this.close = close;
  }

  nextId(): PacketId {
    const currentId = this.packetId;
    do {
      this.packetId++;
      if (this.packetId > maxPacketId) {
        this.packetId = 0;
      }
    } while (
      (this.outgoing.has(this.packetId) ||
        this.pendingOutgoing.has(this.packetId) ||
        this.pendingAckOutgoing.has(this.packetId)) &&
      (this.packetId !== currentId)
    );
    assert(this.packetId !== currentId, "No unused packetId available");
    return this.packetId;
  }

  publish(topic: Topic, packet: Packet): void {
    // don't queue if there are too many packets in queue
    if (this.outgoing.size > maxQueueLength) {
      return;
    }
    // shallow clone is intentional
    const cPacket = Object.assign({}, packet);
    // set packetId to client specific id
    const nextId = this.nextId();
    if (cPacket.id !== undefined) {
      cPacket.id = nextId;
    }

    // retain flag is unset towards clients
    if (cPacket.retain) {
      cPacket.retain = false;
    }
    // set qos to qos requested during subscription
    const qos = this.subscriptions.get(topic);
    cPacket.qos = qos;

    // if client is online just send
    if (this.state === ClientState.online) {
      debug.log(`Client ${this.id} is online`);
      this.outgoing.set(nextId, cPacket);
      if (this.outgoing.size === 1) {
        (async () => {
          await this.handler(this.outgoing, this.pendingOutgoing);
        })();
      }
      return;
    }
    // client is offline, enqueue but only for qos > 0
    if ((qos || 0) > 0) {
      this.outgoing.set(nextId, cPacket);
    }
  }
}

export class MemoryPersistence implements Persistence {
  clientList: Map<ClientId, Client>;
  retained: RetainStore;
  private trie: Trie<Client>;

  constructor() {
    this.clientList = new Map();
    this.retained = new Map();
    this.trie = new Trie();
  }

  registerClient(clientId: ClientId, handler: Handler, close: Handler): Client {
    const client = new MemoryClient(clientId, handler, close);
    this.clientList.set(clientId, client);
    return client;
  }

  getClient(clientId: ClientId): Client | undefined {
    return this.clientList.get(clientId);
  }

  deregisterClient(clientId: ClientId): void {
    if (this.clientList.has(clientId)) {
      const client = this.getClient(clientId);
      if (client) {
        this.unsubscribeAll(client);
      }
      this.clientList.delete(clientId);
    }
  }

  subscribe(client: Client, topic: Topic, qos: QoS): void {
    if (!client.subscriptions.has(topic)) {
      client.subscriptions.set(topic, qos);
      this.trie.add(topic, client);
    }
  }

  unsubscribe(client: Client, topic: Topic): void {
    if (client.subscriptions.has(topic)) {
      client.subscriptions.delete(topic);
      this.trie.remove(topic, client);
    }
  }

  private unsubscribeAll(client: Client) {
    for (const [topic, qos] of client.subscriptions) {
      this.unsubscribe(client, topic);
    }
  }

  publish(topic: Topic, packet: Packet): void {
    if (packet.retain) {
      this.retained.set(packet.topic, packet);
      if (packet.payload === undefined) {
        this.retained.delete(packet.topic);
      }
    }

    // dedup clients
    const clients = new Set(this.trie.match(topic));
    for (const client of clients) {
      debug.log(`publish ${topic} to client ${client.id}`);
      client.publish(topic, packet);
    }
  }

  handleRetained(client: Client, subscriptions: Subscription[]): void {
    const retainedTrie: Trie<Client> = new Trie();
    for (const sub of subscriptions) {
      retainedTrie.add(sub.topicFilter, client);
    }
    for (const [topic, packet] of this.retained) {
      if (retainedTrie.match(topic).length > 0) {
        client.publish(topic, packet);
      }
    }
  }
}
