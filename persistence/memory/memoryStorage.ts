/**
 * @module
 * Volatile in-memory implementation of IStorageProvider.
 * Completely decoupled from MQTT protocol logic.
 */
import type {
  ClientId,
  PacketId,
  PublishPacket,
  Topic,
  TopicFilter,
} from "../deps.ts";
import type {
  ClientRegistrationResult,
  ClientSubscription,
} from "../persistence.ts";
import type { IStorageProvider, TrieSubscription } from "../storage.ts";
import { PacketDirection } from "../storage.ts";
import { topicFilterToRegExp } from "../deps.ts";

export class MemoryStorage implements IStorageProvider {
  private sessionTable = new Map<ClientId, ClientRegistrationResult>();

  private subscriptionTable = new Map<
    ClientId,
    Map<TopicFilter, ClientSubscription>
  >();

  private pendingIncomingTable = new Map<
    ClientId,
    Map<PacketId, PublishPacket>
  >();

  private pendingOutgoingTable = new Map<
    ClientId,
    Map<PacketId, PublishPacket>
  >();

  private pendingAckOutgoingTable = new Map<ClientId, Set<PacketId>>();

  private retainedTable = new Map<Topic, PublishPacket>();

  initialize(): Promise<void> {
    return Promise.resolve();
  }

  // --- Sessions ---
  saveSession(
    clientId: ClientId,
    session: ClientRegistrationResult,
  ): Promise<void> {
    this.sessionTable.set(clientId, session);
    return Promise.resolve();
  }

  getSession(clientId: ClientId): Promise<ClientRegistrationResult | null> {
    return Promise.resolve(this.sessionTable.get(clientId) ?? null);
  }

  deleteSession(clientId: ClientId): Promise<void> {
    this.sessionTable.delete(clientId);
    this.pendingIncomingTable.delete(clientId);
    this.pendingOutgoingTable.delete(clientId);
    this.pendingAckOutgoingTable.delete(clientId);
    this.subscriptionTable.delete(clientId);
    return Promise.resolve();
  }

  async *listAllSessions(): AsyncIterableIterator<
    { clientId: ClientId; session: ClientRegistrationResult }
  > {
    for (const [clientId, session] of this.sessionTable.entries()) {
      yield { clientId, session };
    }
  }

  // --- Subscriptions ---
  saveSubscription(clientId: ClientId, sub: ClientSubscription): Promise<void> {
    let clientSubs = this.subscriptionTable.get(clientId);
    if (!clientSubs) {
      clientSubs = new Map();
      this.subscriptionTable.set(clientId, clientSubs);
    }
    clientSubs.set(sub.topicFilter, sub);
    return Promise.resolve();
  }

  deleteSubscription(
    clientId: ClientId,
    topicFilter: TopicFilter,
  ): Promise<void> {
    this.subscriptionTable.get(clientId)?.delete(topicFilter);
    return Promise.resolve();
  }

  async *listSubscriptions(
    clientId: ClientId,
  ): AsyncIterableIterator<ClientSubscription> {
    const clientSubs = this.subscriptionTable.get(clientId);
    if (clientSubs) {
      for (const sub of clientSubs.values()) {
        yield sub;
      }
    }
  }

  async *listAllSubscriptions(): AsyncIterableIterator<TrieSubscription> {
    for (const [clientId, clientSubs] of this.subscriptionTable.entries()) {
      for (const sub of clientSubs.values()) {
        yield { ...sub, clientId };
      }
    }
  }

  // --- Pending Packets (Incoming & Outgoing) ---
  private getPacketTable(clientId: ClientId, direction: PacketDirection) {
    const table = direction === PacketDirection.Incoming
      ? this.pendingIncomingTable
      : this.pendingOutgoingTable;
    let clientPackets = table.get(clientId);
    if (!clientPackets) {
      clientPackets = new Map();
      table.set(clientId, clientPackets);
    }
    return clientPackets;
  }

  savePendingPacket(
    clientId: ClientId,
    direction: PacketDirection,
    packet: PublishPacket,
  ): Promise<void> {
    if (packet.id !== undefined) {
      this.getPacketTable(clientId, direction).set(packet.id, packet);
    }
    return Promise.resolve();
  }

  getPendingPacket(
    clientId: ClientId,
    direction: PacketDirection,
    packetId: PacketId,
  ): Promise<PublishPacket | null> {
    const packet = this.getPacketTable(clientId, direction).get(packetId);
    return Promise.resolve(packet ?? null);
  }

  deletePendingPacket(
    clientId: ClientId,
    direction: PacketDirection,
    packetId: PacketId,
  ): Promise<boolean> {
    const deleted = this.getPacketTable(clientId, direction).delete(packetId);
    return Promise.resolve(deleted);
  }

  async *listPendingPackets(
    clientId: ClientId,
    direction: PacketDirection,
  ): AsyncIterableIterator<PublishPacket> {
    const clientPackets = this.getPacketTable(clientId, direction);
    for (const packet of clientPackets.values()) {
      yield packet;
    }
  }

  // --- ACKs ---
  private getAckSet(clientId: ClientId): Set<PacketId> {
    let ackSet = this.pendingAckOutgoingTable.get(clientId);
    if (!ackSet) {
      ackSet = new Set();
      this.pendingAckOutgoingTable.set(clientId, ackSet);
    }
    return ackSet;
  }

  savePendingAck(clientId: ClientId, packetId: PacketId): Promise<void> {
    this.getAckSet(clientId).add(packetId);
    return Promise.resolve();
  }

  hasPendingAck(clientId: ClientId, packetId: PacketId): Promise<boolean> {
    const hasAck = this.getAckSet(clientId).has(packetId);
    return Promise.resolve(hasAck);
  }

  deletePendingAck(clientId: ClientId, packetId: PacketId): Promise<boolean> {
    const deleted = this.getAckSet(clientId).delete(packetId);
    return Promise.resolve(deleted);
  }

  async *listPendingAcks(clientId: ClientId): AsyncIterableIterator<PacketId> {
    const ackSet = this.getAckSet(clientId);
    for (const packetId of ackSet) {
      yield packetId;
    }
  }

  // --- Retained Messages ---
  saveRetained(topic: Topic, packet: PublishPacket): Promise<void> {
    this.retainedTable.set(topic, packet);
    return Promise.resolve();
  }

  deleteRetained(topic: Topic): Promise<void> {
    this.retainedTable.delete(topic);
    return Promise.resolve();
  }

  async *listRetainedMatches(
    topicFilter: TopicFilter,
  ): AsyncIterableIterator<PublishPacket> {
    const regex = topicFilterToRegExp(topicFilter);
    for (const [topic, packet] of this.retainedTable.entries()) {
      if (regex.test(topic)) {
        yield packet;
      }
    }
  }
}
