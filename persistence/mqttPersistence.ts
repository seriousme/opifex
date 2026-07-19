import type {
  ClientId,
  PacketId,
  PublishPacket,
  QoS,
  Topic,
  TopicFilter,
  TRetainHandling,
} from "./deps.ts";
import type {
  ClientRegistrationResult,
  ClientSubscription,
  Handler,
  IPersistence,
} from "./persistence.ts";
import type { IStorageProvider, TrieSubscription } from "./storage.ts";
import { PacketDirection } from "./storage.ts";
import { assert, Trie } from "./deps.ts";
import { MAX_PACKET_ID } from "./persistence.ts";

export class MqttPersistence implements IPersistence {
  private clientHandlerList = new Map<ClientId, Handler>();
  private trie = new Trie<TrieSubscription>();
  private packetIdCounters = new Map<ClientId, number>();
  private storage: IStorageProvider;

  constructor(storage: IStorageProvider) {
    this.storage = storage;
  }

  async initialize(): Promise<void> {
    await this.storage.initialize();
    // Warm up the fast matching Trie on startup
    for await (const sub of this.storage.listAllSubscriptions()) {
      this.trie.add(sub.topicFilter, sub);
    }
  }

  async registerClient(
    clientId: ClientId,
    handler: Handler,
  ): Promise<ClientRegistrationResult> {
    this.clientHandlerList.set(clientId, handler);
    let session = await this.storage.getSession(clientId);
    if (session) {
      session.existingSession = true;
      await this.storage.saveSession(clientId, session);
      return session;
    }
    session = { existingSession: false };
    await this.storage.saveSession(clientId, session);
    this.packetIdCounters.set(clientId, 0);
    return session;
  }

  async deregisterClient(clientId: ClientId): Promise<void> {
    this.clientHandlerList.delete(clientId);
    this.packetIdCounters.delete(clientId);

    for await (const sub of this.storage.listSubscriptions(clientId)) {
      this.trie.remove(sub.topicFilter, { clientId });
    }
    await this.storage.deleteSession(clientId);
  }

  disconnectClient(clientId: ClientId): Promise<void> {
    this.clientHandlerList.delete(clientId);
    return Promise.resolve();
  }

  // --- Subscriptions ---
  async subscribe(
    clientId: ClientId,
    topicFilter: TopicFilter,
    qos: QoS,
    noLocal?: boolean,
    retainAsPublished?: boolean,
    retainHandling?: TRetainHandling,
    subscriptionIdentifier?: number,
  ): Promise<void> {
    const rawSub = {
      topicFilter,
      qos,
      noLocal,
      retainAsPublished,
      retainHandling,
      subscriptionIdentifier,
    };

    // remove undefined values to match the Typescript definition
    const sub = Object.fromEntries(
      Object.entries(rawSub).filter(([_, value]) => value !== undefined),
    ) as ClientSubscription;

    await this.storage.saveSubscription(clientId, sub);

    const trieSub = { ...sub, clientId } as TrieSubscription;
    this.trie.remove(topicFilter, { clientId });
    this.trie.add(topicFilter, trieSub);
  }

  async unsubscribe(
    clientId: ClientId,
    topicFilter: TopicFilter,
  ): Promise<void> {
    this.trie.remove(topicFilter, { clientId });
    await this.storage.deleteSubscription(clientId, topicFilter);
  }

  listSubscriptions(
    clientId: ClientId,
  ): AsyncIterableIterator<ClientSubscription> {
    return this.storage.listSubscriptions(clientId);
  }

  // --- Map remaining incoming/outgoing/ack methods to storage directly ---
  async addPendingIncomingPacket(
    clientId: ClientId,
    packet: PublishPacket,
  ): Promise<void> {
    if (packet.id) {
      await this.storage.savePendingPacket(
        clientId,
        PacketDirection.Incoming,
        packet,
      );
    }
  }
  getPendingIncomingPacket(
    clientId: ClientId,
    packetId: PacketId,
  ): Promise<PublishPacket | null> {
    return this.storage.getPendingPacket(
      clientId,
      PacketDirection.Incoming,
      packetId,
    );
  }
  listPendingIncomingPackets(
    clientId: ClientId,
  ): AsyncIterableIterator<PublishPacket> {
    return this.storage.listPendingPackets(clientId, PacketDirection.Incoming);
  }
  deletePendingIncomingPacket(
    clientId: ClientId,
    packetId: PacketId,
  ): Promise<boolean> {
    return this.storage.deletePendingPacket(
      clientId,
      PacketDirection.Incoming,
      packetId,
    );
  }
  async addPendingOutgoingPacket(
    clientId: ClientId,
    packet: PublishPacket,
  ): Promise<void> {
    if (packet.id) {
      await this.storage.savePendingPacket(
        clientId,
        PacketDirection.Outgoing,
        packet,
      );
    }
  }
  listPendingOutgoingPackets(
    clientId: ClientId,
  ): AsyncIterableIterator<PublishPacket> {
    return this.storage.listPendingPackets(clientId, PacketDirection.Outgoing);
  }
  deletePendingOutgoingPacket(
    clientId: ClientId,
    packetId: PacketId,
  ): Promise<boolean> {
    return this.storage.deletePendingPacket(
      clientId,
      PacketDirection.Outgoing,
      packetId,
    );
  }
  addPendingAck(clientId: ClientId, packetId: PacketId): Promise<void> {
    return this.storage.savePendingAck(clientId, packetId);
  }
  hasPendingAck(clientId: ClientId, packetId: PacketId): Promise<boolean> {
    return this.storage.hasPendingAck(clientId, packetId);
  }
  deletePendingAck(clientId: ClientId, packetId: PacketId): Promise<boolean> {
    return this.storage.deletePendingAck(clientId, packetId);
  }
  listPendingAcks(clientId: ClientId): AsyncIterableIterator<PacketId> {
    return this.storage.listPendingAcks(clientId);
  }

  // --- Unified Packet ID Assignment ---
  async nextPacketId(clientId: ClientId): Promise<PacketId> {
    const currentId = this.packetIdCounters.get(clientId) || 0;
    let nextId = currentId;
    do {
      nextId++;
      if (nextId > MAX_PACKET_ID) nextId = 1;

      const inUseOut = await this.storage.getPendingPacket(
        clientId,
        PacketDirection.Outgoing,
        nextId as PacketId,
      );
      const inUseAck = await this.storage.hasPendingAck(
        clientId,
        nextId as PacketId,
      );

      if (!inUseOut && !inUseAck) {
        this.packetIdCounters.set(clientId, nextId);
        return nextId as PacketId;
      }
    } while (nextId !== currentId);
    assert(false, "No unused packetId available");
  }

  // --- Unified Publish Protocol Logic (MQTT v5 Compliant) ---
  async publish(
    publisherClientId: ClientId,
    topic: Topic,
    packet: PublishPacket,
  ): Promise<void> {
    if (packet.retain) {
      if (!packet.payload?.byteLength) {
        await this.storage.deleteRetained(packet.topic);
      } else {
        await this.storage.saveRetained(topic, packet);
      }
    }

    const clients = new Map<
      ClientId,
      { maxQos: QoS; retainAsPublished: boolean; subIds: number[] }
    >();

    for (const sub of this.trie.match(topic)) {
      sub.retainAsPublished = sub.retainAsPublished ?? true;
      if (sub.noLocal && sub.clientId === publisherClientId) continue;

      let target = clients.get(sub.clientId);
      if (!target) {
        target = {
          maxQos: sub.qos,
          retainAsPublished: sub.retainAsPublished,
          subIds: [],
        };
        clients.set(sub.clientId, target);
      } else {
        if (sub.qos > target.maxQos) target.maxQos = sub.qos;
        if (sub.retainAsPublished) target.retainAsPublished = true;
      }
      if (sub.subscriptionIdentifier !== undefined) {
        target.subIds.push(sub.subscriptionIdentifier);
      }
    }

    for (const [clientId, opts] of clients) {
      const newPacket = structuredClone(packet);
      if (!(opts.retainAsPublished ?? true)) newPacket.retain = false;

      const originalQos = packet.qos || 0;
      newPacket.qos = originalQos < opts.maxQos ? originalQos : opts.maxQos;

      if (opts.subIds.length > 0 && newPacket.protocolLevel === 5) {
        newPacket.properties = {
          ...newPacket.properties,
          subscriptionIdentifiers: opts.subIds,
        };
      }
      await this.dispatch(clientId, newPacket);
    }
  }

  async dispatch(clientId: ClientId, packet: PublishPacket): Promise<void> {
    const handler = this.clientHandlerList.get(clientId);
    const qos = packet.qos || 0;
    if (qos === 0) {
      packet.id = 0;
      if (handler) handler(packet);
      return;
    }

    packet.id = await this.nextPacketId(clientId);
    await this.addPendingOutgoingPacket(clientId, packet);
    if (handler) handler(packet);
  }

  // --- Unified Retained Logic ---
  async handleRetained(clientId: ClientId): Promise<void> {
    const handler = this.clientHandlerList.get(clientId);
    if (!handler) return;

    const session = await this.storage.getSession(clientId);

    for (const sub of await Array.fromAsync(this.listSubscriptions(clientId))) {
      for await (
        const packet of this.storage.listRetainedMatches(sub.topicFilter)
      ) {
        const retainHandling = sub.retainHandling ?? 0;
        if (retainHandling === 2) continue;
        if (retainHandling === 1 && session?.existingSession) continue;

        const newPacket = structuredClone(packet);
        if (!(sub.retainAsPublished ?? true)) newPacket.retain = false;

        if (
          sub.subscriptionIdentifier !== undefined &&
          newPacket.protocolLevel === 5
        ) {
          newPacket.properties = {
            ...newPacket.properties,
            subscriptionIdentifiers: [sub.subscriptionIdentifier],
          };
        }

        const originalQos = packet.qos || 0;
        newPacket.qos = originalQos < sub.qos ? originalQos : sub.qos;
        await handler(newPacket);
      }
    }
  }
}
