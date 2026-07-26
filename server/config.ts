/**
 * Server configuration parameters
 */

import { MQTTLevel } from "./deps.ts";

export const defaultConfiguration = {
  context: {
    protocols: [MQTTLevel.v4, MQTTLevel.v5],
    maxSessionExpiryInterval: 86400, // 1 day
    receiveMaximum: 65535,
    maximumQos: 2,
    retainAvailable: true,
    maximumConnectPacketSize: 4000,
    maximumIncomingPacketSize: 4000,
    maximumOutgoingPacketSize: 4000,
    provideReasonStrings: false,
    topicAliasMaximum: 5,
    wildcardSubscriptionAvailable: true,
    subscriptionIdentifierAvailable: false,
    sharedSubscriptionAvailable: false,
    serverKeepAlive: 100,
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
