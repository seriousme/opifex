/**
 * Server configuration parameters
 */

import { MQTTLevel } from "./deps.ts";

export const defaultConfiguration = {
  context: {
    maxSessionExpiryInterval: 86400, // 1 day
    maximumConnectPacketSize: 4000,
    maximumIncomingPacketSize: 4000,
    maximumOutgoingPacketSize: 4000,
    maximumQos: 2,
    maxTopicLevels: 50,
    preconnectTimeoutMs: 3000,
    protocols: [MQTTLevel.v4, MQTTLevel.v5],
    provideReasonStrings: false,
    receiveMaximum: 65535,
    retainAvailable: true,
    serverKeepAlive: 100, // 100 seconds
    sharedSubscriptionAvailable: true,
    subscriptionIdentifierAvailable: true,
    topicAliasMaximum: 5,
    wildcardSubscriptionAvailable: true,
  },
};

type DefaultContext = typeof defaultConfiguration.context;
type BaseContext =
  & Omit<DefaultContext, "sessionExpiryInterval">
  & {
    maxSessionExpiryInterval: number | undefined;
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
