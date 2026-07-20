/**
 * @module persistence
 * @description Module for handling MQTT message persistence and client management
 */
import type {
  ClientId,
  PacketId,
  PublishPacket,
  QoS,
  Topic,
  TopicFilter,
  TRetainHandling,
} from "./deps.ts";

export type ClientSubscription = {
  topicFilter: TopicFilter;
  qos: QoS;
  noLocal?: boolean;
  retainAsPublished?: boolean;
  retainHandling?: TRetainHandling;
  subscriptionIdentifier?: number;
};

/**
 * Maximum packet ID value for MQTT messages (0xffff/65535)
 */
export const MAX_PACKET_ID = 0xffff;

// Handler function type for processing publish packets
export type Handler = (packet: PublishPacket) => void | Promise<void>;

// The result returned by client registration
export type ClientRegistrationResult = {
  existingSession: boolean;
};

/**
 * Interface for persistence implementations to store messages and subscriptions
 */
export interface IPersistence {
  // initialize the persistence
  // e.g. setting up the data store
  initialize(): Promise<void>;

  // client registration
  registerClient(
    clientId: ClientId,
    handler: Handler,
  ): Promise<ClientRegistrationResult>;
  deregisterClient(clientId: ClientId): Promise<void>;

  disconnectClient(clientId: ClientId): Promise<void>;

  // subscription management
  subscribe(
    clientId: ClientId,
    topicFilter: TopicFilter,
    qos: QoS,
    noLocal?: boolean,
    retainAsPublished?: boolean,
    retainHandling?: TRetainHandling,
    subscriptionIdentifier?: number,
  ): Promise<void>;
  unsubscribe(clientId: ClientId, topicFilter: TopicFilter): Promise<void>;
  listSubscriptions(
    clientId: ClientId,
  ): AsyncIterableIterator<ClientSubscription>;

  // Incoming Packet management
  addPendingIncomingPacket(
    clientId: ClientId,
    packet: PublishPacket,
  ): Promise<void>;
  getPendingIncomingPacket(
    clientId: ClientId,
    packetId: PacketId,
  ): Promise<PublishPacket | null>;
  listPendingIncomingPackets(
    clientId: ClientId,
  ): AsyncIterableIterator<PublishPacket>;
  deletePendingIncomingPacket(
    clientId: ClientId,
    packetId: PacketId,
  ): Promise<boolean>;

  // Outgoing Packet management
  addPendingOutgoingPacket(
    clientId: ClientId,
    packet: PublishPacket,
  ): Promise<void>;
  listPendingOutgoingPackets(
    clientId: ClientId,
  ): AsyncIterableIterator<PublishPacket>;
  deletePendingOutgoingPacket(
    clientId: ClientId,
    packetId: PacketId,
  ): Promise<boolean>;

  // Acks
  addPendingAck(clientId: ClientId, packetId: PacketId): Promise<void>;
  hasPendingAck(clientId: ClientId, packetId: PacketId): Promise<boolean>;
  deletePendingAck(clientId: ClientId, packetId: PacketId): Promise<boolean>;
  listPendingAcks(clientId: ClientId): AsyncIterableIterator<PacketId>;

  // Message Delivery & Retained
  publish(
    clientId: ClientId,
    topic: Topic,
    packet: PublishPacket,
  ): Promise<void>;
  handleRetained(
    clientId: ClientId,
    subscriptions: ClientSubscription[],
  ): Promise<void>;

  // Packet ID Generation
  nextPacketId(clientId: ClientId): Promise<PacketId>;
}
