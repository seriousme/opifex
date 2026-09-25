/**
 * @module persistence
 * @description Module for handling MQTT message persistence and client management
 */
import type {
  ClientId,
  PacketId,
  PublishPacketV5,
  QoS,
  RetainHandling,
  TopicFilter,
} from "./deps.ts";

/**
 * extended publish packet also contains meta data
 */
export type ExtPublishPacket = PublishPacketV5 & {
  expiresAtMs?: number;
};

/**
 * The MQTT topic share to subscribe/unsubscribe to
 */
export type ShareName = string;

export type ClientSubscription = {
  topicFilter: TopicFilter;
  shareName: ShareName;
  qos: QoS;
  noLocal?: boolean;
  retainAsPublished?: boolean;
  retainHandling?: RetainHandling;
  subscriptionIdentifier?: number;
};

/**
 * Maximum packet ID value for MQTT messages (0xffff/65535)
 */
export const MAX_PACKET_ID = 0xffff;

// Handler function type for processing publish packets
export type Handler = (packet: ExtPublishPacket) => void | Promise<void>;

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
    subscription: ClientSubscription,
  ): Promise<void>;
  unsubscribe(
    clientId: ClientId,
    topicFilter: TopicFilter,
    shareName: ShareName,
  ): Promise<void>;
  listSubscriptions(
    clientId: ClientId,
  ): AsyncIterableIterator<ClientSubscription>;

  // Incoming Packet management
  addPendingIncomingPacket(
    clientId: ClientId,
    packet: ExtPublishPacket,
  ): Promise<void>;
  getPendingIncomingPacket(
    clientId: ClientId,
    packetId: PacketId,
  ): Promise<ExtPublishPacket | null>;
  listPendingIncomingPackets(
    clientId: ClientId,
  ): AsyncIterableIterator<ExtPublishPacket>;
  deletePendingIncomingPacket(
    clientId: ClientId,
    packetId: PacketId,
  ): Promise<boolean>;

  // Outgoing Packet management
  addPendingOutgoingPacket(
    clientId: ClientId,
    packet: ExtPublishPacket,
  ): Promise<void>;
  getPendingOutgoingPacket(
    clientId: ClientId,
    packetId: PacketId,
  ): Promise<ExtPublishPacket | null>;
  updatePendingOutgoingPacket(
    clientId: ClientId,
    packetId: PacketId,
    dup: boolean,
  ): Promise<boolean>;
  listPendingOutgoingPackets(
    clientId: ClientId,
  ): AsyncIterableIterator<ExtPublishPacket>;
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
    packet: ExtPublishPacket,
  ): Promise<void>;
  handleRetained(
    clientId: ClientId,
    subscriptions: ClientSubscription[],
  ): Promise<void>;

  // Packet ID Generation
  nextPacketId(clientId: ClientId): Promise<PacketId>;
}
