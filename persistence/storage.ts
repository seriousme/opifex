import type { ClientId, PacketId, Topic, TopicFilter } from "./deps.ts";
import type {
  ClientRegistrationResult,
  ClientSubscription,
  ExtPublishPacket,
} from "./persistence.ts";

export type TrieSubscription = ClientSubscription & { clientId: ClientId };
export const PacketDirection = {
  Incoming: 0,
  Outgoing: 1,
} as const;

export type PacketDirection =
  typeof PacketDirection[keyof typeof PacketDirection];

export interface IStorageProvider {
  initialize(): Promise<void>;
  close?(): Promise<void>;

  // --- Session Storage ---
  saveSession(
    clientId: ClientId,
    session: ClientRegistrationResult,
  ): Promise<void>;
  getSession(clientId: ClientId): Promise<ClientRegistrationResult | null>;
  deleteSession(clientId: ClientId): Promise<void>;
  listAllSessions(): AsyncIterableIterator<
    { clientId: ClientId; session: ClientRegistrationResult }
  >;

  // --- Subscription Storage ---
  saveSubscription(clientId: ClientId, sub: ClientSubscription): Promise<void>;
  deleteSubscription(
    clientId: ClientId,
    topicFilter: TopicFilter,
  ): Promise<void>;
  listSubscriptions(
    clientId: ClientId,
  ): AsyncIterableIterator<ClientSubscription>;
  listAllSubscriptions(): AsyncIterableIterator<TrieSubscription>;

  // --- Pending Packet Storage (Incoming & Outgoing) ---
  savePendingPacket(
    clientId: ClientId,
    direction: PacketDirection,
    packet: ExtPublishPacket,
  ): Promise<void>;
  getPendingPacket(
    clientId: ClientId,
    direction: PacketDirection,
    packetId: PacketId,
  ): Promise<ExtPublishPacket | null>;
  updatePendingPacket(
    clientId: ClientId,
    direction: PacketDirection,
    packetId: PacketId,
    dup: boolean,
  ): Promise<boolean>;
  deletePendingPacket(
    clientId: ClientId,
    direction: PacketDirection,
    packetId: PacketId,
  ): Promise<boolean>;
  listPendingPackets(
    clientId: ClientId,
    direction: PacketDirection,
  ): AsyncIterableIterator<ExtPublishPacket>;

  // --- Pending Acknowledgment Storage ---
  savePendingAck(clientId: ClientId, packetId: PacketId): Promise<void>;
  hasPendingAck(clientId: ClientId, packetId: PacketId): Promise<boolean>;
  deletePendingAck(clientId: ClientId, packetId: PacketId): Promise<boolean>;
  listPendingAcks(clientId: ClientId): AsyncIterableIterator<PacketId>;

  // --- Retained Message Storage ---
  saveRetained(topic: Topic, packet: ExtPublishPacket): Promise<void>;
  deleteRetained(topic: Topic): Promise<void>;
  listRetainedMatches(
    topicFilter: TopicFilter,
  ): AsyncIterableIterator<ExtPublishPacket>;
}
