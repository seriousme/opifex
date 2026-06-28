/**
 * @module persistence
 * @description Module for handling MQTT message persistence and client management
 */
export type {
  IBaseStore,
  IPacketIdStore,
  IPacketStore,
  IStore,
  ISubscriptionStore,
} from "./store.ts";
export type {
  ClientId,
  PacketId,
  PublishPacket,
  QoS,
  Topic,
  TopicFilter,
} from "./deps.ts";
export type {
  Client,
  ClientRegistrationResult,
  Handler,
  IPersistence,
  RetainStore,
} from "./persistence.ts";
export { maxPacketId } from "./persistence.ts";
export { SQLitePersistence } from "./sqlite/sqlitePersistence.ts";
