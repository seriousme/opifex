/**
 * @module persistence
 * @description Module for handling MQTT message persistence and client management
 */
import type { ClientId, PublishPacket, QoS, Topic } from "./deps.ts";
import type { IStore } from "./store.ts";

/**
 * Handler function type for processing publish packets
 * @callback Handler
 * @param {PublishPacket} packet - The MQTT publish packet to handle
 */
export type Handler = (packet: PublishPacket) => void;

/**
 * Store type for retained messages mapped by topic
 * @typedef {Map<Topic, PublishPacket>} RetainStore
 */
export type RetainStore = Map<Topic, PublishPacket>;

/**
 * Client type containing message store and packet handler
 * @typedef {Object} Client
 * @property {IStore} store - The client's message store
 * @property {Handler} handler - The client's packet handler function
 */
export type Client = { store: IStore; handler: Handler };

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
   * Map of retained messages by topic
   * @type {RetainStore}
   */
  retained: RetainStore;

  /**
   * Register a new client with the persistence layer
   * @param {ClientId} clientId - Unique identifier for the client
   * @param {Handler} handler - Packet handler function for the client
   * @param {boolean} clean - Whether to start with a clean session
   * @returns {IStore} The client's message store
   */
  registerClient(clientId: ClientId, handler: Handler, clean: boolean): IStore;

  /**
   * Remove a client from the persistence layer
   * @param {ClientId} clientId - ID of client to deregister
   */
  deregisterClient(clientId: ClientId): void;

  /**
   * Publish a message to all subscribed clients
   * @param {Topic} topic - Topic to publish to
   * @param {PublishPacket} packet - Packet containing the message
   */
  publish(topic: Topic, packet: PublishPacket): void;

  /**
   * Subscribe a client to a topic
   * @param {IStore} store - Client's message store
   * @param {Topic} topic - Topic to subscribe to
   * @param {QoS} qos - Quality of Service level
   */
  subscribe(store: IStore, topic: Topic, qos: QoS): void;

  /**
   * Unsubscribe a client from a topic
   * @param {IStore} store - Client's message store
   * @param {Topic} topic - Topic to unsubscribe from
   */
  unsubscribe(store: IStore, topic: Topic): void;

  /**
   * Send retained messages to a client
   * @param {ClientId} clientId - ID of client to send retained messages to
   */
  handleRetained(clientId: ClientId): void;
}
