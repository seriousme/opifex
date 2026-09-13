import type { ClientId, PacketId, QoS, TopicFilter } from "./deps.ts";
import type {
  ClientRegistrationResult,
  ClientSubscription,
  ExtPublishPacket,
  Handler,
  IPersistence,
  ShareName,
} from "./persistence.ts";
import type { IStorageProvider } from "./storage.ts";
import { PacketDirection } from "./storage.ts";
import { assert, logger, topicFiltersOverlap, Trie } from "./deps.ts";
import { MAX_PACKET_ID } from "./persistence.ts";

type ConsolidatedSubscription =
  & Omit<
    ClientSubscription,
    "qos" | "subscriptionIdentifier" | "retainHandling"
  >
  & {
    maxQos: QoS;
    subscriptionIdentifiers: number[];
  };

type TrieSub = ConsolidatedSubscription & { clientId: ClientId };

/**
 * Calculates pre-consolidated routing rules for overlapping filters of a SINGLE client.
 */
function consolidateClientSubscriptions(
  clientSubs: ClientSubscription[],
): ConsolidatedSubscription[] {
  const consolidated: ConsolidatedSubscription[] = [];

  for (const targetSub of clientSubs) {
    let maxQos = targetSub.qos;
    let retainAsPublished = targetSub.retainAsPublished ?? true;
    let noLocal = targetSub.noLocal ?? false;
    const subIds = new Set<number>();

    if (targetSub.subscriptionIdentifier) {
      subIds.add(targetSub.subscriptionIdentifier);
    }

    // Compare targetSub against all other subscriptions for this client to detect overlap
    for (const otherSub of clientSubs) {
      if (targetSub.topicFilter === otherSub.topicFilter) continue;

      // If the two filters overlap on potential topics
      if (
        targetSub.shareName === otherSub.shareName &&
        topicFiltersOverlap(targetSub.topicFilter, otherSub.topicFilter)
      ) {
        maxQos = Math.max(maxQos, otherSub.qos) as QoS;
        if (otherSub.retainAsPublished) retainAsPublished = true;
        // noLocal is only preserved if both filters requested noLocal
        noLocal = noLocal && (otherSub.noLocal ?? false);

        if (otherSub.subscriptionIdentifier) {
          subIds.add(otherSub.subscriptionIdentifier);
        }
      }
    }

    consolidated.push({
      topicFilter: targetSub.topicFilter,
      maxQos,
      retainAsPublished,
      noLocal,
      subscriptionIdentifiers: Array.from(subIds),
      shareName: targetSub.shareName,
    });
  }

  return consolidated;
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

export class MqttPersistence implements IPersistence {
  private clientHandlerList = new Map<ClientId, Handler>();
  private trie = new Trie<TrieSub>();
  private packetIdCounters = new Map<ClientId, number>();
  private storage: IStorageProvider;
  private sharedGroupCounters = new Map<string, number>();

  constructor(storage: IStorageProvider) {
    this.storage = storage;
  }

  async initialize(): Promise<void> {
    await this.storage.initialize();
    // Warm up the fast matching Trie on startup
    for await (const { clientId } of this.storage.listAllSessions()) {
      const clientSubs = await Array.fromAsync(
        this.storage.listSubscriptions(clientId),
      );
      const consolidatedSubs = consolidateClientSubscriptions(clientSubs);
      for (const sub of consolidatedSubs) {
        this.trie.remove(sub.topicFilter, {
          clientId,
          shareName: sub.shareName,
        });
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

    const clientSubs = await Array.fromAsync(
      this.storage.listSubscriptions(clientId),
    );
    const consolidatedSubs = consolidateClientSubscriptions(clientSubs);
    for (const sub of consolidatedSubs) {
      if (sub) {
        this.trie.remove(sub.topicFilter, {
          clientId,
          shareName: sub.shareName,
        });
        const trieSub = { ...sub, clientId } as TrieSub;
        this.trie.add(sub.topicFilter, trieSub);
      }
    }
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
    const allSubs = await Array.fromAsync(
      this.storage.listSubscriptions(clientId),
    );
    const consolidatedSubs = consolidateClientSubscriptions(allSubs);
    for (const sub of consolidatedSubs) {
      if (sub) {
        this.trie.remove(sub.topicFilter, {
          clientId,
          shareName: sub.shareName,
        });
        const trieSub = { ...sub, clientId } as TrieSub;
        this.trie.add(sub.topicFilter, trieSub);
      }
    }
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
    logger.debug(`updatePendingOutGoingPacket: id ${packetId} , dup ${dup}`);
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

    const directClients = new Map<
      ClientId,
      TrieSub
    >();
    const sharedGroups = new Map<string, TrieSub[]>();

    for (const sub of this.trie.match(topic)) {
      if (sub.noLocal && sub.clientId === publisherClientId) continue;
      if (sub.shareName) {
        // It is a Shared Subscription
        if (!sharedGroups.has(sub.shareName)) {
          sharedGroups.set(sub.shareName, []);
        }
        sharedGroups.get(sub.shareName)!.push(sub);
      } else {
        // only one match per client is enough as we already pre-consolidated the subscriptions
        if (!directClients.has(sub.clientId)) {
          directClients.set(sub.clientId, sub);
        }
      }
    }

    for (const [clientId, sub] of directClients) {
      await this.dispatch(
        clientId,
        packet,
        sub.maxQos,
        sub.retainAsPublished,
        sub.subscriptionIdentifiers,
      );
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
      await this.dispatch(
        selectedClient.clientId,
        packet,
        selectedClient.maxQos,
        selectedClient.retainAsPublished,
        [],
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
        logger.error(`Error delivering packet to ${clientId}:`, err);
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

    const allSubs = await Array.fromAsync(
      this.storage.listSubscriptions(clientId),
    );
    const consolidatedSubs = consolidateClientSubscriptions(allSubs);

    const seenTopics = new Set<string>();

    for (const sub of subscriptions) {
      for await (
        const packet of this.storage.listRetainedMatches(sub.topicFilter)
      ) {
        // Deduplicate retained messages per topic delivered in this batch
        if (seenTopics.has(packet.topic)) continue;

        seenTopics.add(packet.topic);
        for (const consSub of consolidatedSubs) {
          if (topicFiltersOverlap(consSub.topicFilter, packet.topic)) {
            await this.dispatch(
              clientId,
              packet,
              consSub.maxQos,
              consSub.retainAsPublished,
              consSub.subscriptionIdentifiers,
            );
            break;
          }
        }
      }
    }
  }
}
