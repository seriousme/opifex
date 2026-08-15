import type {
  ClientId,
  PacketId,
  QoS,
  TopicFilter,
  TRetainHandling,
} from "./deps.ts";
import type {
  ClientRegistrationResult,
  ClientSubscription,
  ExtPublishPacket,
  Handler,
  IPersistence,
} from "./persistence.ts";
import type { IStorageProvider, TrieSubscription } from "./storage.ts";
import { PacketDirection } from "./storage.ts";
import { assert, parseTopicFilter, Trie } from "./deps.ts";
import { MAX_PACKET_ID } from "./persistence.ts";
import { logger } from "./deps.ts";

export class MqttPersistence implements IPersistence {
  private clientHandlerList = new Map<ClientId, Handler>();
  private trie = new Trie<TrieSubscription>();
  private packetIdCounters = new Map<ClientId, number>();
  private storage: IStorageProvider;
  private sharedGroupCounters = new Map<string, number>();

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
    const { topicFilter: parsedTopicFilter, shareName } = parseTopicFilter(
      topicFilter,
    );
    const rawSub = {
      topicFilter: parsedTopicFilter,
      qos,
      noLocal,
      retainAsPublished,
      retainHandling,
      subscriptionIdentifier,
      shareName,
    };

    // remove undefined values to match the Typescript definition
    const sub = Object.fromEntries(
      Object.entries(rawSub).filter(([_, value]) => value !== undefined),
    ) as ClientSubscription;

    await this.storage.saveSubscription(clientId, sub);

    const trieSub = { ...sub, clientId } as TrieSubscription;
    this.trie.remove(topicFilter, { clientId, topicFilter });
    this.trie.add(topicFilter, trieSub);
  }

  async unsubscribe(
    clientId: ClientId,
    topicFilter: TopicFilter,
  ): Promise<void> {
    const { topicFilter: parsedTopicFilter, shareName } = parseTopicFilter(
      topicFilter,
    );
    this.trie.remove(parsedTopicFilter, { clientId, shareName });
    await this.storage.deleteSubscription(clientId, topicFilter);
  }

  listSubscriptions(
    clientId: ClientId,
  ): AsyncIterableIterator<ClientSubscription> {
    return this.storage.listSubscriptions(clientId);
  }

  /**
   * check if the client is still subscribed to the packets topic
   * as things could have changed, e.g. between enqueing and resending offline packets
   * and add subscriptionIdentifiers
   */
  private matchSubscriptions(
    clientId: ClientId,
    packet: ExtPublishPacket,
  ): boolean {
    let maxQos = 0;
    const subIds = [];
    let matched = false;
    for (const sub of this.trie.match(packet.topic)) {
      if (sub.clientId === clientId) {
        matched = true;
        if (sub.subscriptionIdentifier) {
          subIds.push(sub.subscriptionIdentifier);
        }
        if (sub.qos > maxQos) {
          maxQos = sub.qos;
        }
      }
    }
    if (subIds.length > 0 && packet.protocolLevel === 5) {
      if (packet.properties === undefined) {
        packet.properties = {};
      }
      packet.properties.subscriptionIdentifiers = subIds;
    }
    const originalQos = packet.qos || 0;
    packet.qos = (originalQos < maxQos ? originalQos : maxQos) as QoS;
    logger.debug(
      `matchSubscriptions: topic ${packet.topic}, matched ${matched}`,
    );
    return matched;
  }

  async addPendingIncomingPacket(
    clientId: ClientId,
    packet: ExtPublishPacket,
  ): Promise<void> {
    logger.debug(
      `addPendingIncomingPacket: id ${packet.id} , topic "${packet.topic}", QoS ${packet.qos}`,
    );

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
  ): Promise<ExtPublishPacket | null> {
    return this.storage.getPendingPacket(
      clientId,
      PacketDirection.Incoming,
      packetId,
    );
  }

  async *listPendingIncomingPackets(
    clientId: ClientId,
  ): AsyncIterableIterator<ExtPublishPacket> {
    for await (
      const packet of this.storage.listPendingPackets(
        clientId,
        PacketDirection.Incoming,
      )
    ) {
      // Clean up expired packets
      const packetExpired = packet.expiresAtMs
        ? Date.now() > packet.expiresAtMs
        : false;
      if (packetExpired) {
        if (packet.id) {
          await this.storage.deletePendingPacket(
            clientId,
            PacketDirection.Incoming,
            packet.id,
          );
        }
      } else {
        yield packet;
      }
    }
  }

  deletePendingIncomingPacket(
    clientId: ClientId,
    packetId: PacketId,
  ): Promise<boolean> {
    logger.debug(`delete PendingIncomingPacket: id ${packetId}`);

    return this.storage.deletePendingPacket(
      clientId,
      PacketDirection.Incoming,
      packetId,
    );
  }
  async addPendingOutgoingPacket(
    clientId: ClientId,
    packet: ExtPublishPacket,
  ): Promise<void> {
    if (packet.id) {
      logger.debug(
        `addPendingOutGoingPacket: id ${packet.id} , topic "${packet.topic}", QoS ${packet.qos}`,
      );
      await this.storage.savePendingPacket(
        clientId,
        PacketDirection.Outgoing,
        packet,
      );
    }
  }

  async *listPendingOutgoingPackets(
    clientId: ClientId,
  ): AsyncIterableIterator<ExtPublishPacket> {
    for await (
      const packet of this.storage.listPendingPackets(
        clientId,
        PacketDirection.Outgoing,
      )
    ) {
      // Clean up
      // - orphaned pending packet since client unsubscribed while offline
      // - expired packets
      const packetExpired = packet.expiresAtMs
        ? Date.now() > packet.expiresAtMs
        : false;
      if (!this.matchSubscriptions(clientId, packet) || packetExpired) {
        if (packet.id) {
          await this.storage.deletePendingPacket(
            clientId,
            PacketDirection.Outgoing,
            packet.id,
          );
        }
      } else {
        yield packet;
      }
    }
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

  // --- Packet ID Assignment ---
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

  // --- Publish Protocol Logic
  async publish(
    publisherClientId: ClientId,
    packet: ExtPublishPacket,
  ): Promise<void> {
    const topic = packet.topic;
    logger.debug(
      `mqttPersistence: publish "${publisherClientId}" "${topic}", ${packet.qos}`,
    );
    if (packet.retain) {
      if (!packet.payload?.byteLength) {
        await this.storage.deleteRetained(topic);
      } else {
        await this.storage.saveRetained(topic, packet);
      }
    }

    const directClients = new Map<
      ClientId,
      { maxQos: QoS; retainAsPublished: boolean }
    >();
    const sharedGroups = new Map<string, TrieSubscription[]>();

    for (const sub of this.trie.match(topic)) {
      sub.retainAsPublished = sub.retainAsPublished ?? true;
      if (sub.noLocal && sub.clientId === publisherClientId) continue;

      if (sub.shareName) {
        // Het is een Shared Subscription
        if (!sharedGroups.has(sub.shareName)) {
          sharedGroups.set(sub.shareName, []);
        }
        sharedGroups.get(sub.shareName)!.push(sub);
      } else {
        let target = directClients.get(sub.clientId);
        if (!target) {
          target = {
            maxQos: sub.qos,
            retainAsPublished: sub.retainAsPublished,
          };
          directClients.set(sub.clientId, target);
        } else {
          if (sub.qos > target.maxQos) target.maxQos = sub.qos;
          if (sub.retainAsPublished) target.retainAsPublished = true;
        }
      }
    }

    for (const [clientId, opts] of directClients) {
      const newPacket = structuredClone(packet);
      if (!(opts.retainAsPublished ?? true)) newPacket.retain = false;

      const originalQos = packet.qos || 0;
      newPacket.qos = originalQos < opts.maxQos ? originalQos : opts.maxQos;
      await this.dispatch(clientId, newPacket);
    }

    for (const [shareName, candidates] of sharedGroups) {
      // selects active candidates
      const activeCandidates = candidates.filter((c) =>
        this.clientHandlerList.has(c.clientId)
      );
      if (activeCandidates.length === 0) continue;

      // select 1 client using Round-Robin
      const currentIndex = this.sharedGroupCounters.get(shareName) || 0;
      const selectedClient =
        activeCandidates[currentIndex % activeCandidates.length];
      this.sharedGroupCounters.set(shareName, currentIndex + 1);
      if (selectedClient === undefined) continue;

      const newPacket = structuredClone(packet);
      if (!(selectedClient.retainAsPublished ?? true)) newPacket.retain = false;
      const originalQos = packet.qos || 0;
      newPacket.qos = originalQos < selectedClient.qos
        ? originalQos
        : selectedClient.qos;

      await this.dispatch(selectedClient.clientId, newPacket);
    }
  }

  async dispatch(
    clientId: ClientId,
    packet: ExtPublishPacket,
  ): Promise<void> {
    const handler = this.clientHandlerList.get(clientId);
    logger.debug(`dispatch ${clientId}, ${packet.topic}, ${packet.qos}`);
    const qos = packet.qos || 0;
    if (qos === 0) {
      packet.id = 0;
      if (!this.matchSubscriptions(clientId, packet)) {
        // client is no longer subscribed
        return;
      }
      if (handler) handler(packet);
      return;
    }

    if (!this.matchSubscriptions(clientId, packet)) {
      // client is no longer subscribed
      return;
    }
    packet.id = await this.nextPacketId(clientId);
    await this.addPendingOutgoingPacket(clientId, packet);
    if (handler) handler(packet);
  }

  // --- Unified Retained Logic ---
  async handleRetained(
    clientId: ClientId,
    subscriptions: ClientSubscription[],
  ): Promise<void> {
    if (!this.clientHandlerList.get(clientId)) {
      return;
    }

    const seen = new Set();
    for (const sub of subscriptions) {
      for await (
        const packet of this.storage.listRetainedMatches(sub.topicFilter)
      ) {
        if (seen.has(packet.topic)) continue; //dedupe
        seen.add(packet.topic);
        const newPacket = structuredClone(packet);
        if (!(sub.retainAsPublished ?? true)) newPacket.retain = false;
        await this.dispatch(clientId, newPacket);
      }
    }
  }
}
