/**
 * @module
 * Volatile in-memory implementation of IStorageProvider.
 * Completely decoupled from MQTT protocol logic.
 */
import type { ClientId, PacketId, Topic, TopicFilter } from "../deps.ts";
import type {
  ClientRegistrationResult,
  ClientSubscription,
  ExtPublishPacket,
  ShareName,
} from "../persistence.ts";
import type { IStorageProvider, StoredSubscription } from "../storage.ts";
import { PacketDirection } from "../storage.ts";
import { joinTopicFilter, topicFilterToRegExp } from "../deps.ts";

type pendingTableEntry = {
  seqId: number;
  packet: ExtPublishPacket;
  createdAtMs: number;
};

export class MemoryStorage implements IStorageProvider {
  private seqId = 1;
  private sessionTable = new Map<ClientId, ClientRegistrationResult>();

  private subscriptionTable = new Map<
    ClientId,
    Map<TopicFilter, ClientSubscription>
  >();

  private pendingIncomingTable = new Map<
    ClientId,
    Map<PacketId, pendingTableEntry>
  >();

  private pendingOutgoingTable = new Map<
    ClientId,
    Map<PacketId, pendingTableEntry>
  >();

  private pendingAckOutgoingTable = new Map<ClientId, Set<PacketId>>();

  private retainedTable = new Map<Topic, ExtPublishPacket>();

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
    const key = joinTopicFilter(sub.topicFilter, sub.shareName);
    const clientSubs = this.subscriptionTable.getOrInsert(clientId, new Map());
    clientSubs.set(key, sub);
    return Promise.resolve();
  }

  deleteSubscription(
    clientId: ClientId,
    topicFilter: TopicFilter,
    shareName: ShareName,
  ): Promise<void> {
    const key = joinTopicFilter(topicFilter, shareName);
    this.subscriptionTable.get(clientId)?.delete(key);
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

  async *listAllSubscriptions(): AsyncIterableIterator<StoredSubscription> {
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
    return table.getOrInsert(clientId, new Map());
  }

  savePendingPacket(
    clientId: ClientId,
    direction: PacketDirection,
    packet: ExtPublishPacket,
  ): Promise<void> {
    const createdAtMs = Date.now();
    if (packet.id !== undefined) {
      this.getPacketTable(clientId, direction).set(packet.id, {
        seqId: this.seqId++,
        packet,
        createdAtMs,
      });
    }
    return Promise.resolve();
  }

  getPendingPacket(
    clientId: ClientId,
    direction: PacketDirection,
    packetId: PacketId,
  ): Promise<ExtPublishPacket | null> {
    const entry = this.getPacketTable(clientId, direction).get(packetId);
    return Promise.resolve(entry?.packet ?? null);
  }

  updatePendingPacket(
    clientId: ClientId,
    direction: PacketDirection,
    packetId: PacketId,
    dup: boolean,
  ): Promise<boolean> {
    const entry = this.getPacketTable(clientId, direction).get(packetId);
    if (entry !== undefined) {
      entry.packet.dup = dup;
    }
    return Promise.resolve(entry !== undefined);
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
  ): AsyncIterableIterator<ExtPublishPacket> {
    const queue = this.getPacketTable(clientId, direction);
    if (!queue) return;

    for (const entry of queue.values()) {
      yield entry.packet;
    }
  }

  // --- ACKs ---
  private getAckSet(clientId: ClientId): Set<PacketId> {
    return this.pendingAckOutgoingTable.getOrInsert(clientId, new Set());
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
  saveRetained(topic: Topic, packet: ExtPublishPacket): Promise<void> {
    this.retainedTable.set(topic, packet);
    return Promise.resolve();
  }

  deleteRetained(topic: Topic): Promise<void> {
    this.retainedTable.delete(topic);
    return Promise.resolve();
  }

  async *listRetainedMatches(
    topicFilter: TopicFilter,
  ): AsyncIterableIterator<ExtPublishPacket> {
    const regex = topicFilterToRegExp(topicFilter);
    for (const [topic, packet] of this.retainedTable.entries()) {
      if (regex.test(topic)) {
        yield packet;
      }
    }
  }
}
