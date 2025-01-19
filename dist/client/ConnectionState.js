/**
 * @description Object representing possible connection states
 * @readonly
 */
export const ConnectionState = {
    /** System is offline and not attempting connection */
    offline: "offline",
    /** System is in the process of establishing a connection */
    connecting: "connecting",
    /** System has an active connection */
    connected: "connected",
    /** System is in the process of disconnecting */
    disconnecting: "disconnecting",
    /** System has been disconnected */
    disconnected: "disconnected",
};
