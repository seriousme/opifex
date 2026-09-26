import type { ClientId, PacketId, QoS, TopicFilter } from "./deps.ts";
import type {
  ClientRegistrationResult,
  ClientSubscription,
  ExtPublishPacket,
  Handler,
  Persistence,
  ShareName,
} from "./persistence.ts";
import type { StorageProvider } from "./storage.ts";
import { PacketDirection } from "./storage.ts";
import { assert, getOrInsert, logger, Trie } from "./deps.ts";
import { MAX_PACKET_ID } from "./persistence.ts";

type TrieSub = ClientSubscription & { clientId: ClientId };

type ClientTrieSubs = Map<ClientId, TrieSub[]>;
type consolidatedSubs = {
  maxQos: QoS;
  retainAsPublished: boolean;
  subscriptionIdentifiers: number[];
};

// consolidate the subscriptions
function consolidateSubs(subs: TrieSub[]): consolidatedSubs {
  let maxQos: QoS = 0;
  let retainAsPublished: boolean = true;
  const subscriptionIdentifiers: number[] = [];
  for (const sub of subs) {
    if (sub.qos > maxQos) maxQos = sub.qos;
    if (sub.subscriptionIdentifier) {
      subscriptionIdentifiers.push(sub.subscriptionIdentifier);
    }
    if (sub.retainAsPublished === false) retainAsPublished = false;
  }
  return {
    maxQos,
    retainAsPublished,
    subscriptionIdentifiers,
  };
}

function clonePacket(packet: ExtPublishPacket): ExtPublishPacket {
  if ((packet.protocolLevel === 5) && packet.properties) {
    const newPacket = {
      ...packet,
      dup: false,
    };
    newPacket.properties = {
      ...packet.properties,
      subscriptionIdentifiers: undefined,
      topicAlias: undefined,
    };
    return newPacket;
  }
  const newPacket = {
    ...packet,
    dup: false,
  };
  return newPacket;
}

export class MqttPersistence implements Persistence {
  private clientHandlerList = new Map<ClientId, Handler>();
  private trie = new Trie<TrieSub>();
  private packetIdCounters = new Map<ClientId, number>();
  private storage: StorageProvider;
  private sharedGroupCounters = new Map<string, number>();

  constructor(storage: StorageProvider) {
    this.storage = storage;
  }

  async initialize(): Promise<void> {
    await this.storage.initialize();
    // Load the fast matching Trie on startup
    for await (const { clientId } of this.storage.listAllSessions()) {
      for await (const sub of this.storage.listSubscriptions(clientId)) {
        const trieSub = { ...sub, clientId } as TrieSub;
        this.trie.add(sub.topicFilter, trieSub);
      }
    }
  }

  async registerClient(
    clientId: ClientId,
    clientDispatch: Handler,
  ): Promise<ClientRegistrationResult> {
    this.clientHandlerList.set(clientId, clientDispatch);
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
    subscription: ClientSubscription,
  ): Promise<void> {
    await this.storage.saveSubscription(clientId, subscription);
    this.trie.remove(subscription.topicFilter, {
      clientId,
      shareName: subscription.shareName,
    });
    const trieSub = { ...subscription, clientId } as TrieSub;
    this.trie.add(subscription.topicFilter, trieSub);
  }

  async unsubscribe(
    clientId: ClientId,
    topicFilter: TopicFilter,
    shareName: ShareName,
  ): Promise<void> {
    await this.storage.deleteSubscription(
      clientId,
      topicFilter,
      shareName,
    );
    this.trie.remove(topicFilter, {
      clientId,
      shareName: shareName,
    });
  }

  listSubscriptions(
    clientId: ClientId,
  ): AsyncIterableIterator<ClientSubscription> {
    return this.storage.listSubscriptions(clientId);
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
    logger.debug("delete PendingIncomingPacket: id", packetId);

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

  getPendingOutgoingPacket(
    clientId: ClientId,
    packetId: PacketId,
  ): Promise<ExtPublishPacket | null> {
    return this.storage.getPendingPacket(
      clientId,
      PacketDirection.Outgoing,
      packetId,
    );
  }

  async updatePendingOutgoingPacket(
    clientId: ClientId,
    packetId: PacketId,
    dup: boolean,
  ): Promise<boolean> {
    logger.debug("updatePendingOutGoingPacket: id", packetId, ", dup", dup);
    return await this.storage.updatePendingPacket(
      clientId,
      PacketDirection.Outgoing,
      packetId,
      dup,
    );
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
      // - expired packets
      const packetExpired = packet.expiresAtMs
        ? Date.now() > packet.expiresAtMs
        : false;
      if (packetExpired) {
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

    const directClients: ClientTrieSubs = new Map();
    const sharedGroups = new Map<string, ClientTrieSubs>();

    for (const sub of this.trie.match(topic)) {
      if (sub.noLocal && sub.clientId === publisherClientId) continue;
      if (sub.shareName) {
        // Shared Subscription
        const shareClients = getOrInsert(
          sharedGroups,
          sub.shareName,
          new Map(),
        );
        getOrInsert(shareClients, sub.clientId, []).push(sub);
      } else {
        // Standard subscription
        getOrInsert(directClients, sub.clientId, []).push(sub);
      }
    }

    for (const [clientId, subs] of directClients) {
      const { maxQos, retainAsPublished, subscriptionIdentifiers } =
        consolidateSubs(subs);
      await this.dispatch(
        clientId,
        packet,
        maxQos,
        retainAsPublished,
        subscriptionIdentifiers,
      );
    }

    for (const [shareName, shareClients] of sharedGroups) {
      // selects active candidates
      const activeCandidates: ClientId[] = [];
      for (const clientId of shareClients.keys()) {
        if (this.clientHandlerList.has(clientId)) {
          activeCandidates.push(clientId);
        }
      }
      if (activeCandidates.length === 0) continue;

      // select 1 client using Round-Robin
      const currentIndex = this.sharedGroupCounters.get(shareName) || 0;
      const selectedClient =
        activeCandidates[currentIndex % activeCandidates.length];
      this.sharedGroupCounters.set(shareName, currentIndex + 1);
      if (selectedClient === undefined) continue;
      const { maxQos, retainAsPublished, subscriptionIdentifiers } =
        consolidateSubs(shareClients.get(selectedClient)!);
      await this.dispatch(
        selectedClient,
        packet,
        maxQos,
        retainAsPublished,
        subscriptionIdentifiers,
      );
    }
  }

  private async dispatch(
    clientId: ClientId,
    packet: ExtPublishPacket,
    maxQos: QoS,
    retainAsPublished: boolean | undefined,
    subscriptionIdentifiers: number[],
  ): Promise<void> {
    logger.debug(
      "mqttpersistence: dispatch",
      {
        clientId,
        topic: packet.topic,
        maxQos,
        retainAsPublished,
        subscriptionIdentifiers,
      },
    );

    const newPacket = clonePacket(packet);
    if (!retainAsPublished) newPacket.retain = false;
    newPacket.qos = Math.min(packet.qos ?? 0, maxQos) as QoS;

    const qos = newPacket.qos;
    if (subscriptionIdentifiers.length > 0) {
      newPacket.protocolLevel = 5;
      if (!newPacket.properties) {
        newPacket.properties = {};
      }
      newPacket.properties.subscriptionIdentifiers = subscriptionIdentifiers;
    }
    if (qos !== 0) {
      newPacket.id = await this.nextPacketId(clientId);
      await this.addPendingOutgoingPacket(clientId, newPacket);
    }

    const clientDispatch = this.clientHandlerList.get(clientId);
    // don't await the clientDispatch to allow for parallelism
    if (clientDispatch) {
      Promise.resolve(clientDispatch(newPacket)).catch((err) => {
        logger.error("Error delivering packet to", clientId, ":", err);
      });
    }
  }

  async handleRetained(
    clientId: ClientId,
    subscriptions: ClientSubscription[],
  ): Promise<void> {
    const clientDispatch = this.clientHandlerList.get(clientId);
    if (!clientDispatch) {
      return;
    }

    const tempTrie: Trie<TrieSub> = new Trie();
    for await (const sub of this.storage.listSubscriptions(clientId)) {
      if (sub.shareName !== "") continue;
      tempTrie.add(sub.topicFilter, { clientId, ...sub });
    }

    const seenTopics = new Set<string>();

    for (const sub of subscriptions) {
      for await (
        const packet of this.storage.listRetainedMatches(sub.topicFilter)
      ) {
        // Deduplicate retained messages per topic delivered in this batch
        if (seenTopics.has(packet.topic)) continue;
        seenTopics.add(packet.topic);
        const subs = tempTrie.match(packet.topic);
        const { maxQos, retainAsPublished, subscriptionIdentifiers } =
          consolidateSubs(subs);
        await this.dispatch(
          clientId,
          packet,
          maxQos,
          retainAsPublished,
          subscriptionIdentifiers,
        );
      }
    }
  }
}
