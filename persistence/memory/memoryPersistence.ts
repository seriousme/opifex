/**
 * @module
 * In-memory persistence implementations for MQTT clients, sessions, and subscriptions.
 * Suitable for testing or non-persistent MQTT broker setups.
 */
import type {
  ClientId,
  PacketId,
  PublishPacket,
  QoS,
  Topic,
  TopicFilter,
  TRetainHandling,
} from "../deps.ts";

import type {
  ClientRegistrationResult,
  ClientSubscription,
  Handler,
  IPersistence,
} from "../persistence.ts";

import { MAX_PACKET_ID } from "../mod.ts";
import { assert, Trie } from "../deps.ts";

/**
 * Extended representation of a subscription supporting MQTT v5 options for
 * storage in the table
 */
type ClientSubscriptionData = Omit<ClientSubscription, "topicFilter"> & {
  clientId: ClientId;
};

/**
 * In-memory database providing volatile storage for MQTT client configurations,
 * active subscriptions, and pending QoS messages.
 */
export class MemoryPersistence implements IPersistence {
  /**
   * Active network connection handlers indexed by client ID.
   */
  public clientHandlerList: Map<ClientId, Handler> = new Map();

  /**
   * Sessions registry tracking whether a connection is new or resumed.
   */
  private sessionTable = new Map<ClientId, ClientRegistrationResult>();

  /**
   * Maps a client ID to their subscriptions, tracking v5 options per topic filter.
   */
  private subscriptionTable = new Map<
    ClientId,
    Map<TopicFilter, ClientSubscriptionData>
  >();

  /**
   * Prefix tree for efficient topic matching against active subscriptions.
   */
  private trie = new Trie<ClientSubscriptionData>();

  /**
   * Unacknowledged incoming QoS packets stored per client.
   */
  private pendingIncomingTable = new Map<
    ClientId,
    Map<PacketId, PublishPacket>
  >();

  /**
   * Unacknowledged outgoing QoS packets stored per client.
   */
  private pendingOutgoingTable = new Map<
    ClientId,
    Map<PacketId, PublishPacket>
  >();

  /**
   * Tracks packet identifiers awaiting a confirmation response.
   */
  private pendingAckOutgoingTable = new Map<ClientId, Set<PacketId>>();

  /**
   * Global table for retained messages, mapped by exact topic.
   */
  private retainedTable = new Map<Topic, PublishPacket>();

  /**
   * State counter tracking the last assigned packet identifier per client.
   */
  private packetIdCounters = new Map<ClientId, number>();

  /**
   * Prepares the persistence adapter. Resolves immediately for in-memory setups.
   */
  initialize(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Convenient lifecycle method combining instance creation and initialization.
   */
  static async start(): Promise<MemoryPersistence> {
    const persistence = new MemoryPersistence();
    await persistence.initialize();
    return persistence;
  }

  /**
   * Registers a client connection, initializing state tables if it's a new session.
   */
  registerClient(
    clientId: ClientId,
    handler: Handler,
  ): Promise<ClientRegistrationResult> {
    this.clientHandlerList.set(clientId, handler);

    const session = this.sessionTable.get(clientId);
    if (session) {
      session.existingSession = true;
      return Promise.resolve(session);
    }
    const newSession = { existingSession: false };
    this.sessionTable.set(clientId, newSession);
    this.subscriptionTable.set(clientId, new Map());
    this.pendingIncomingTable.set(clientId, new Map());
    this.pendingOutgoingTable.set(clientId, new Map());
    this.pendingAckOutgoingTable.set(clientId, new Set());
    this.packetIdCounters.set(clientId, 0);
    return Promise.resolve(newSession);
  }

  /**
   * Deregisters a client session entirely, wiping out pending states and subscriptions.
   */
  async deregisterClient(clientId: ClientId): Promise<void> {
    this.clientHandlerList.delete(clientId);
    this.sessionTable.delete(clientId);
    this.pendingIncomingTable.delete(clientId);
    this.pendingOutgoingTable.delete(clientId);
    this.pendingAckOutgoingTable.delete(clientId);
    this.packetIdCounters.delete(clientId);

    const subs = await Array.fromAsync(this.listSubscriptions(clientId));
    for (const { topicFilter } of subs) {
      this.unsubscribe(clientId, topicFilter);
    }
    this.subscriptionTable.delete(clientId);

    return Promise.resolve();
  }

  /**
   * Severs the active network link handler without erasing persistent session state.
   */
  disconnectClient(clientId: ClientId): Promise<void> {
    this.clientHandlerList.delete(clientId);
    return Promise.resolve();
  }

  // --- Subscriptions (with MQTT v5 Support) ---

  /**
   * Creates or updates a subscription mapping for a client, storing core QoS and v5 spec configurations.
   */
  subscribe(
    clientId: ClientId,
    topicFilter: TopicFilter,
    qos: QoS,
    noLocal?: boolean,
    retainAsPublished?: boolean,
    retainHandling?: TRetainHandling,
    subscriptionIdentifier?: number,
  ): Promise<void> {
    const clientSubs = this.subscriptionTable.get(clientId);
    if (clientSubs) {
      const subscriptionData: ClientSubscriptionData = {
        clientId,
        qos,
        noLocal,
        retainAsPublished,
        retainHandling,
        subscriptionIdentifier,
      };
      clientSubs.set(topicFilter, subscriptionData);
      this.trie.remove(topicFilter, { clientId });
      this.trie.add(topicFilter, subscriptionData);
    }
    return Promise.resolve();
  }

  /**
   * Removes a subscription rule for a specific client, updating both the state list and prefix tree.
   */
  unsubscribe(clientId: ClientId, topicFilter: TopicFilter): Promise<void> {
    const clientSubs = this.subscriptionTable.get(clientId);
    if (clientSubs) {
      this.trie.remove(topicFilter, { clientId });
      clientSubs.delete(topicFilter);
    }
    return Promise.resolve();
  }

  /**
   * Asynchronously streams all active subscriptions registered under a specific client.
   */
  async *listSubscriptions(
    clientId: ClientId,
  ): AsyncIterableIterator<ClientSubscription> {
    const clientSubs = this.subscriptionTable.get(clientId);
    if (clientSubs) {
      for (const [topicFilter, subData] of clientSubs.entries()) {
        yield {
          topicFilter,
          qos: subData.qos,
          noLocal: subData.noLocal,
          retainAsPublished: subData.retainAsPublished,
          retainHandling: subData.retainHandling,
          subscriptionIdentifier: subData.subscriptionIdentifier,
        };
      }
    }
  }

  // --- Packet Management Incoming ---

  /**
   * Tracks an incoming unacknowledged publish packet waiting for a local response.
   */
  addPendingIncomingPacket(
    clientId: ClientId,
    packet: PublishPacket,
  ): Promise<void> {
    if (packet.id) {
      this.pendingIncomingTable.get(clientId)?.set(packet.id, packet);
    }
    return Promise.resolve();
  }

  /**
   * Retrieves a targeted unacknowledged incoming publish packet.
   */
  getPendingIncomingPacket(
    clientId: ClientId,
    packetId: PacketId,
  ): Promise<PublishPacket | null> {
    const clientPackets = this.pendingIncomingTable.get(clientId);
    if (clientPackets) {
      const packet = clientPackets.get(packetId);
      return Promise.resolve(packet ?? null);
    }
    return Promise.resolve(null);
  }

  /**
   * Iterates through all currently unacknowledged packets received from a given client.
   */
  async *listPendingIncomingPackets(
    clientId: ClientId,
  ): AsyncIterableIterator<PublishPacket> {
    const clientPackets = this.pendingIncomingTable.get(clientId);
    if (clientPackets) {
      for (const packet of clientPackets.values()) {
        yield packet;
      }
    }
  }

  /**
   * Removes an incoming packet record once the handshake sequence concludes.
   */
  deletePendingIncomingPacket(
    clientId: ClientId,
    packetId: PacketId,
  ): Promise<boolean> {
    return Promise.resolve(
      this.pendingIncomingTable.get(clientId)?.delete(packetId) ?? false,
    );
  }

  // --- Packet Management Outgoing ---

  /**
   * Tracks a sent packet awaiting acknowledgment from the destination client.
   */
  addPendingOutgoingPacket(
    clientId: ClientId,
    packet: PublishPacket,
  ): Promise<void> {
    if (packet.id) {
      this.pendingOutgoingTable.get(clientId)?.set(packet.id, packet);
    }
    return Promise.resolve();
  }

  /**
   * Yields every unacknowledged outbound publication packet mapped to a specific client.
   */
  async *listPendingOutgoingPackets(
    clientId: ClientId,
  ): AsyncIterableIterator<PublishPacket> {
    const clientPackets = this.pendingOutgoingTable.get(clientId);
    if (clientPackets) {
      for (const packet of clientPackets.values()) {
        yield packet;
      }
    }
  }

  /**
   * Clears a stored outgoing packet after confirmation is received from the remote client.
   */
  deletePendingOutgoingPacket(
    clientId: ClientId,
    packetId: PacketId,
  ): Promise<boolean> {
    return Promise.resolve(
      this.pendingOutgoingTable.get(clientId)?.delete(packetId) ?? false,
    );
  }

  // --- ACKs ---

  /**
   * Logs a pending acknowledgment token sequence state for an outgoing flow.
   */
  addPendingAck(clientId: ClientId, packetId: PacketId): Promise<void> {
    this.pendingAckOutgoingTable.get(clientId)?.add(packetId);
    return Promise.resolve();
  }

  /**
   * Determines if a specific packet identifier is locked in an acknowledgment wait state.
   */
  hasPendingAck(clientId: ClientId, packetId: PacketId): Promise<boolean> {
    return Promise.resolve(
      this.pendingAckOutgoingTable.get(clientId)?.has(packetId) ?? false,
    );
  }

  /**
   * Streams packet identifiers currently trapped in an outbound confirmation loop.
   */
  async *listPendingAcks(
    clientId: ClientId,
  ): AsyncIterableIterator<PacketId> {
    const clientPacketIds = this.pendingAckOutgoingTable.get(clientId);
    if (clientPacketIds) {
      for (const packet of clientPacketIds.keys()) {
        yield packet;
      }
    }
  }

  /**
   * Discards an unacknowledged token sequence once matching control flow packets arrive.
   */
  deletePendingAck(clientId: ClientId, packetId: PacketId): Promise<boolean> {
    return Promise.resolve(
      this.pendingAckOutgoingTable.get(clientId)?.delete(packetId) ?? false,
    );
  }

  /**
   * Generates the next available Packet Identifier for the client's session.
   * Ensures the generated ID is not currently in use by pending packets.
   */
  nextPacketId(clientId: ClientId): Promise<PacketId> {
    const currentId = this.packetIdCounters.get(clientId);
    const pendingOutgoing = this.pendingOutgoingTable.get(clientId);
    const pendingAckOutgoing = this.pendingAckOutgoingTable.get(clientId);
    let nextId = currentId!;
    do {
      nextId++;
      if (nextId! > MAX_PACKET_ID) {
        nextId = 1;
      }
    } while (
      ((pendingOutgoing!.has(nextId)) ||
        (pendingAckOutgoing!.has(nextId))) &&
      nextId !== currentId
    );
    assert(nextId !== currentId, "No unused packetId available");
    this.packetIdCounters.set(clientId, nextId);
    return Promise.resolve(nextId);
  }

  // --- Business Logic (MQTT v5 Compliant) ---

  /**
   * Evaluates incoming data payloads, routes them into matching subscriber sessions,
   * updates global retained state flags, and manages MQTT v5 attributes.
   */
  async publish(
    publisherClientId: ClientId,
    topic: Topic,
    packet: PublishPacket,
  ): Promise<void> {
    if (packet.retain) {
      if (!packet.payload?.byteLength) {
        this.retainedTable.delete(packet.topic);
      } else {
        this.retainedTable.set(topic, packet);
      }
    }

    // Map to group matched client details & aggregate choices when multiple filters match
    const clients = new Map<
      ClientId,
      {
        maxQos: QoS;
        retainAsPublished: boolean;
        subIds: number[];
      }
    >();

    for (const sub of this.trie.match(topic)) {
      if (sub.noLocal && sub.clientId === publisherClientId) {
        continue;
      }

      let clientTarget = clients.get(sub.clientId);
      if (!clientTarget) {
        clientTarget = {
          maxQos: sub.qos,
          retainAsPublished: !!sub.retainAsPublished,
          subIds: [],
        };
        clients.set(sub.clientId, clientTarget);
      } else {
        // Evaluate Max QoS across all matches
        if (sub.qos > clientTarget.maxQos) {
          clientTarget.maxQos = sub.qos;
        }
        // If at least one matching subscription has Retain As Published, it overrides and remains true.
        if (sub.retainAsPublished) {
          clientTarget.retainAsPublished = true;
        }
      }

      if (sub.subscriptionIdentifier !== undefined) {
        clientTarget.subIds.push(sub.subscriptionIdentifier);
      }
    }

    for (const [clientId, targetOpts] of clients) {
      const newPacket = structuredClone(packet);

      if (!targetOpts.retainAsPublished) {
        newPacket.retain = false;
      }

      const originalQos = packet.qos || 0;
      newPacket.qos = originalQos < targetOpts.maxQos
        ? originalQos
        : targetOpts.maxQos;

      // Assign multiple subscription identifiers if matched [MQTT-3.3.4-3]
      if (targetOpts.subIds.length > 0 && newPacket.protocolLevel === 5) {
        newPacket.properties = {
          ...newPacket.properties,
          subscriptionIdentifiers: targetOpts.subIds,
        };
      }

      await this.dispatch(clientId, newPacket);
    }
  }

  /**
   * Ships transmission-ready publication flows out via client event links, allocating packet IDs
   * and tracking states for flows expecting receipt replies (QoS > 0).
   */
  async dispatch(clientId: ClientId, packet: PublishPacket): Promise<void> {
    const handler = this.clientHandlerList.get(clientId);
    const qos = packet.qos || 0;
    if (qos === 0) {
      packet.id = 0;
      if (handler) {
        handler(packet);
      }
      return;
    }

    packet.id = await this.nextPacketId(clientId);
    this.addPendingOutgoingPacket(clientId, packet);
    if (handler) {
      handler(packet);
    }
  }

  /**
   * Matches and delivers all active retained messages matching the client's subscriptions,
   * respecting MQTT v5 Retain Handling options.
   */
  async handleRetained(clientId: ClientId): Promise<void> {
    const handler = this.clientHandlerList.get(clientId);
    const clientSubs = this.subscriptionTable.get(clientId);

    if (!handler || !clientSubs || clientSubs.size === 0) return;

    // Build a single Trie containing all of this client's active subscriptions once
    const subscriptionTrie = new Trie<ClientSubscriptionData>();
    for (const [topicFilter, subData] of clientSubs.entries()) {
      subscriptionTrie.add(topicFilter, subData);
    }

    // Iterate through the retained messages once and match them against the subscription Trie
    for (const [topic, packet] of this.retainedTable.entries()) {
      const matchedSubscriptions = subscriptionTrie.match(topic);
      if (matchedSubscriptions.length === 0) {
        continue;
      }

      // Aggregate state options if multiple matching subscriptions are returned
      let maxQos: QoS = 0;
      let retainAsPublished = false;
      const subIds: number[] = [];
      let shouldDeliver = false;

      const session = this.sessionTable.get(clientId);

      for (const subData of matchedSubscriptions) {
        const retainHandling = subData.retainHandling ?? 0;

        // 2 = Do not send retained messages at the time of the subscribe
        if (retainHandling === 2) {
          continue;
        }
        // 1 = Send retained messages at subscribe only if the subscription does not currently exist
        if (retainHandling === 1 && session?.existingSession === true) {
          continue;
        }

        // 0 = Send retained messages at the time of the subscribe
        shouldDeliver = true;

        if (subData.qos > maxQos) {
          maxQos = subData.qos;
        }
        if (subData.retainAsPublished) {
          retainAsPublished = true;
        }
        if (subData.subscriptionIdentifier !== undefined) {
          subIds.push(subData.subscriptionIdentifier);
        }
      }

      if (!shouldDeliver) {
        continue;
      }

      const newPacket = structuredClone(packet);

      if (!retainAsPublished) {
        newPacket.retain = false;
      }

      if (subIds.length > 0 && newPacket.protocolLevel === 5) {
        newPacket.properties = {
          ...newPacket.properties,
          subscriptionIdentifiers: subIds,
        };
      }

      const originalQos = packet.qos || 0;
      newPacket.qos = originalQos < maxQos ? originalQos : maxQos;

      await handler(newPacket);
    }
  }
}
