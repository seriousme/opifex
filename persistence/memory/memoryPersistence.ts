/**
 * @module
 * In-memory persistence implementations for MQTT clients, sessions, and subscriptions.
 * Suitable for testing or non-persistent MQTT broker setups.
 */
import type {
  ClientId,
  ClientRegistrationResult,
  Handler,
  IPersistence,
  PacketId,
  PublishPacket,
  QoS,
  Topic,
  TopicFilter,
} from "../mod.ts";

import { MAX_PACKET_ID } from "../mod.ts";
import { assert, Trie } from "../deps.ts";

/**
 * Represents a subscription mapped to a specific client with its QoS level.
 */
type ClientSubscription = {
  clientId: ClientId;
  qos: QoS;
};

export class MemoryPersistence implements IPersistence {
  // active network connections
  public clientHandlerList = new Map<ClientId, Handler>();

  // In-memory "tables",
  private sessionTable = new Map<ClientId, { existingSession: boolean }>();
  private subscriptionTable = new Map<ClientId, Map<TopicFilter, QoS>>();
  private trie = new Trie<ClientSubscription>();
  private pendingIncomingTable = new Map<
    ClientId,
    Map<PacketId, PublishPacket>
  >();
  private pendingOutgoingTable = new Map<
    ClientId,
    Map<PacketId, PublishPacket>
  >();
  private pendingAckOutgoingTable = new Map<ClientId, Set<PacketId>>();

  // Globale retained messages (not client specific)
  private retainedTable = new Map<Topic, PublishPacket>();

  // Packet ID generator per client
  private packetIdCounters = new Map<ClientId, number>();

  initialize(): Promise<void> {
    // In-memory doesn't need setup or initialization
    return Promise.resolve();
  }
  /**
   * Convenience method creation combining instance creation and initialization
   */
  static async start(): Promise<MemoryPersistence> {
    const persistence = new MemoryPersistence();
    await persistence.initialize();
    return persistence;
  }

  registerClient(
    clientId: ClientId,
    handler: Handler,
  ): Promise<ClientRegistrationResult> {
    this.clientHandlerList.set(clientId, handler);

    const session = this.sessionTable.get(clientId);
    if (session) {
      session.existingSession = true;
      return Promise.resolve({ existingSession: true });
    }

    this.sessionTable.set(clientId, { existingSession: false });
    // Initialize empty collections for this client
    this.subscriptionTable.set(clientId, new Map());
    this.pendingIncomingTable.set(clientId, new Map());
    this.pendingOutgoingTable.set(clientId, new Map());
    this.pendingAckOutgoingTable.set(clientId, new Set());
    this.packetIdCounters.set(clientId, 0);
    return Promise.resolve({ existingSession: false });
  }

  async deregisterClient(clientId: ClientId): Promise<void> {
    this.clientHandlerList.delete(clientId);
    this.sessionTable.delete(clientId);
    this.pendingIncomingTable.delete(clientId);
    this.pendingOutgoingTable.delete(clientId);
    this.pendingAckOutgoingTable.delete(clientId);
    this.packetIdCounters.delete(clientId);
    // make sure the subscriptions are removed from the trie
    const subs = await Array.fromAsync(this.getSubscriptions(clientId));
    for (const { topicFilter } of subs) {
      this.unsubscribe(clientId, topicFilter);
    }
    this.subscriptionTable.delete(clientId);

    return Promise.resolve();
  }

  // --- Subscriptions ---
  subscribe(
    clientId: ClientId,
    topicFilter: TopicFilter,
    qos: QoS,
  ): Promise<void> {
    const clientSubs = this.subscriptionTable.get(clientId);
    if (clientSubs) {
      clientSubs.set(topicFilter, qos);
      this.trie.add(topicFilter, { clientId, qos });
    }
    return Promise.resolve();
  }

  unsubscribe(clientId: ClientId, topicFilter: TopicFilter): Promise<void> {
    const clientSubs = this.subscriptionTable.get(clientId);
    if (clientSubs) {
      const qos = clientSubs.get(topicFilter);
      if (qos !== undefined) {
        this.trie.remove(topicFilter, { clientId, qos });
        clientSubs.delete(topicFilter);
      }
    }
    return Promise.resolve();
  }

  async *getSubscriptions(
    clientId: ClientId,
  ): AsyncIterableIterator<{ topicFilter: TopicFilter; qos: QoS }> {
    const clientSubs = this.subscriptionTable.get(clientId);
    if (clientSubs) {
      for (const [topicFilter, qos] of clientSubs.entries()) {
        yield { topicFilter, qos };
      }
    }
  }

  // --- Packet Management Incoming ---
  addPendingIncomingPacket(
    clientId: ClientId,
    packet: PublishPacket,
  ): Promise<void> {
    if (packet.id) {
      this.pendingIncomingTable.get(clientId)?.set(packet.id, packet);
    }
    return Promise.resolve();
  }

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

  deletePendingIncomingPacket(
    clientId: ClientId,
    packetId: PacketId,
  ): Promise<boolean> {
    return Promise.resolve(
      this.pendingIncomingTable.get(clientId)?.delete(packetId) ?? false,
    );
  }

  // --- Packet Management Outgoing ---
  addPendingOutgoingPacket(
    clientId: ClientId,
    packet: PublishPacket,
  ): Promise<void> {
    if (packet.id) {
      this.pendingOutgoingTable.get(clientId)?.set(packet.id, packet);
    }
    return Promise.resolve();
  }

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

  deletePendingOutgoingPacket(
    clientId: ClientId,
    packetId: PacketId,
  ): Promise<boolean> {
    return Promise.resolve(
      this.pendingOutgoingTable.get(clientId)?.delete(packetId) ?? false,
    );
  }

  // --- ACKs ---
  addPendingAck(clientId: ClientId, packetId: PacketId): Promise<void> {
    this.pendingAckOutgoingTable.get(clientId)?.add(packetId);
    return Promise.resolve();
  }

  hasPendingAck(clientId: ClientId, packetId: PacketId): Promise<boolean> {
    return Promise.resolve(
      this.pendingAckOutgoingTable.get(clientId)?.has(packetId) ?? false,
    );
  }

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

  deletePendingAck(clientId: ClientId, packetId: PacketId): Promise<boolean> {
    return Promise.resolve(
      this.pendingAckOutgoingTable.get(clientId)?.delete(packetId) ?? false,
    );
  }

  /**
   * Generates the next available Packet Identifier forthe client's session.
   * Ensures the generated ID is not currently in use by pending packets.
   */
  async nextPacketId(clientId: ClientId): Promise<PacketId> {
    const currentId = this.packetIdCounters.get(clientId);
    const pendingOutgoing = this.pendingOutgoingTable.get(clientId);
    const pendingAckOutgoing = this.pendingAckOutgoingTable.get(clientId);
    let nextId = currentId!;
    do {
      nextId++;
      if (nextId! > MAX_PACKET_ID) {
        nextId = 0;
      }
    } while (
      ((await pendingOutgoing!.has(nextId)) ||
        (await pendingAckOutgoing!.has(nextId))) &&
      nextId !== currentId
    );
    assert(nextId !== currentId, "No unused packetId available");
    this.packetIdCounters.set(clientId, nextId);
    return nextId;
  }

  // --- Business Logic (Publish & Retained) ---
  async publish(
    _clientId: ClientId,
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

    // dedup clients
    const clients = new Map();
    for (const { clientId, qos } of this.trie.match(topic)) {
      const prevQos = clients.get(clientId);
      // if subscriptions overlap then use the highest QoS
      if (!prevQos || prevQos < qos) {
        clients.set(clientId, qos);
      }
    }

    // publish the message to all clients
    for (const [clientId, qos] of clients) {
      const newPacket = structuredClone(packet);
      newPacket.retain = false;
      // subscription QoS is a maximum, not a minimum
      // if the publishers Qos was lower, use that, else use the subscribers
      const newQos = packet.qos || 0;
      newPacket.qos = newQos < qos ? newQos : qos;
      await this.dispatch(clientId, newPacket);
    }
  }

  /**
   * Processes -outbound- publication requests, allocating package IDs and storing
   * unacknowledged QoS > 0 packets into the database.
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
   * Matches and delivers all active retained messages that match the client's current subscriptions.
   * @param clientId The identifier of the client that needs historical retained messages.
   */
  async handleRetained(clientId: ClientId): Promise<void> {
    const handler = this.clientHandlerList.get(clientId);
    const clientSubs = this.subscriptionTable.get(clientId);

    if (!handler || !clientSubs) return;

    const retainedTrie: Trie<ClientId> = new Trie();
    for (const [topicFilter] of clientSubs) {
      retainedTrie.add(topicFilter, clientId);
    }

    for (const [topic, packet] of this.retainedTable.entries()) {
      if (retainedTrie.match(topic).length > 0) {
        await handler(packet);
      }
    }
  }
}
