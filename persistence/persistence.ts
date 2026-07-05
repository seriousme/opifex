/**
 * @module persistence
 * @description Module for handling MQTT message persistence and client management
 */
import type { ClientId, PublishPacket, QoS, Topic } from "./deps.ts";
import type { IStore } from "./store.ts";

/**
 * Maximum packet ID value for MQTT messages (0xffff/65535)
 * @constant {number}
 */
export const MAX_PACKET_ID = 0xffff;
/**
 * Handler function type for processing publish packets
 * @callback Handler
 * @param {PublishPacket} packet - The MQTT publish packet to handle
 */
export type Handler = (packet: PublishPacket) => void | Promise<void>;

/**
 * Client type containing message store and packet handler
 * @typedef {Object} Client
 * @property {IStore} store - The client's message store
 * @property {Handler} handler - The client's packet handler function
 */
export type Client = { store: IStore; handler: Handler };
export type ClientRegistrationResult = {
  store: IStore;
  existingSession: boolean;
};

/**
 * Interface for persistence implementations to store messages and subscriptions
 * @interface IPersistence
 */
export interface IPersistence {
  /**
   * Map of connected clients by client ID
   * @type {Map<ClientId, Client>}
   */
  clientList: Map<ClientId, Client>;

  /**
   * Register a new client with the persistence layer
   * @param {ClientId} clientId - Unique identifier for the client
   * @param {Handler} handler - Packet handler function for the client
   * @param {boolean} clean - Whether to start with a clean session
   * @returns {IStore} The client's message store
   */
  registerClient(
    clientId: ClientId,
    handler: Handler,
    clean: boolean,
  ): Promise<ClientRegistrationResult>;

  /**
   * Remove a client from the persistence layer
   * @param {ClientId} clientId - ID of client to deregister
   */
  deregisterClient(clientId: ClientId): void | Promise<void>;

  /**
   * Publish a message to all subscribed clients
   * @param {Topic} topic - Topic to publish to
   * @param {PublishPacket} packet - Packet containing the message
   */
  publish(topic: Topic, packet: PublishPacket): void | Promise<void>;

  /**
   * Subscribe a client to a topic
   * @param {IStore} store - Client's message store
   * @param {Topic} topic - Topic to subscribe to
   * @param {QoS} qos - Quality of Service level
   */
  subscribe(store: IStore, topic: Topic, qos: QoS): void | Promise<void>;

  /**
   * Unsubscribe a client from a topic
   * @param {IStore} store - Client's message store
   * @param {Topic} topic - Topic to unsubscribe from
   */
  unsubscribe(store: IStore, topic: Topic): void | Promise<void>;

  /**
   * Send retained messages to a client
   * @param {ClientId} clientId - ID of client to send retained messages to
   */
  handleRetained(clientId: ClientId): void | Promise<void>;
}
