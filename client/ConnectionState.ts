export const ConnectionState = {
  offline: "offline",
  connecting: "connecting",
  connected: "connected",
  disconnecting: "disconnecting",
  disconnected: "disconnected",
} as const;

export type TConnectionState =
  (typeof ConnectionState)[keyof typeof ConnectionState];
