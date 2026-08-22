/**
 * Server configuration parameters
 */

import { MQTTLevel } from "./deps.ts";
export const QueueMode = {
  DiscardNewest: 0, // when maxQueued messages has been reached do not accept new ones
  DiscardOldest: 1, // when maxQueued messages has been reached discard the oldest message to make room
} as const;

export type QueueMode = typeof QueueMode[keyof typeof QueueMode];

export const defaultConfiguration = {
  context: {
    maxInflightMessages: 20, // max number of messages sent to a client waiting for puback or pubcomp
    maxQueuedMessages: 1000, // max number of messages in-store per client
    maxSessionExpiryInterval: 86400, // 1 day
    maximumConnectPacketSize: 4000, // max size on Connect packets, keep this resonably small to avoid risk on DoS
    maximumIncomingPacketSize: 4000, // max size for other incoming packets
    maximumOutgoingPacketSize: 4000, // max size for all outgoing packets
    maximumQos: 2, // maximum QoS level accepted by the server
    maxTopicLevels: 50, // topic levels on Topics and TopicFilters, keep this resonably small to avoid risk on DoS
    preconnectTimeoutMs: 3000, // if the client does not complete connect within this time, hangup
    protocols: [MQTTLevel.v4, MQTTLevel.v5],
    provideReasonStrings: false, // provide reasonStrings in ack and disconnect messages
    queueStrategy: QueueMode.DiscardNewest, // see definition of QueueMode
    receiveMaximum: 20, // maximum incoming messages on the server per client waiting for pubComp
    retainAvailable: true, // messages will be retained when retain flag is set
    serverKeepAlive: 100, // 100 seconds
    sharedSubscriptionAvailable: true, // clients can use shared subscriptions
    subscriptionIdentifierAvailable: true, // clients can use subscriptions identifiers
    topicAliasMaximum: 5, // max number of incoming topic aliases the server will acceptper client, 0 = none
    wildcardSubscriptionAvailable: true, // clients can use wildcard subscriptions
  },
};

type DefaultContext = typeof defaultConfiguration.context;
type BaseContext =
  & Omit<DefaultContext, "sessionExpiryInterval" | "queueStrategy">
  & {
    maxSessionExpiryInterval: number | undefined;
    queueStrategy: QueueMode;
  };

type ContextInput = Partial<BaseContext>;

export type Configuration = {
  context: BaseContext;
};

export type ConfigurationInput = {
  context?: ContextInput;
};

// Helper function to safely merge consumer config with defaults
export function createConfiguration(input?: ConfigurationInput): Configuration {
  return {
    context: {
      ...defaultConfiguration.context,
      ...input?.context,
    },
  };
}
