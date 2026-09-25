/**
 *  This module provides an MQTT Client interface see the /bin folder for examples
 *  @module
 */
export {
  Client,
  DEFAULT_KEEPALIVE,
  DEFAULT_PROTOCOLLEVEL,
  DEFAULT_URL,
} from "./client.ts";
export { logger, MQTTLevel, ReasonCode } from "./deps.ts";
export type {
  AuthenticationResult,
  NetAddr,
  ProtocolLevel,
  QoS,
  SockAddr,
  SockConn,
  UnixAddr,
  VsockAddr,
} from "./deps.ts";
export type {
  ConnectParameters,
  PublishParameters,
  SubscribeParameters,
} from "./client.ts";

export type { ConnectionState } from "./ConnectionState.ts";
