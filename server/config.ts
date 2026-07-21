/**
 * Server configuration parameters
 */

export const configuration = {
  context: {
    sessionExpiryInterval: 0, // how long before a session expires
    receiveMaximum: 65535,
    maximumQos: 2,
    retainAvailable: true,
    maximumConnectPacketSize: 4000,
    maximumIncomingPacketSize: 4000,
    maximumOutgoingPacketSize: 4000,
    topicAliasMaximum: 5,
    wildcardSubscriptionAvailable: true,
    subscriptionIdentifierAvailable: false,
    sharedSubscriptionAvailable: false,
    serverKeepAlive: 100,
  },
};

export type Configuration = typeof configuration;
