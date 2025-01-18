/**
 *  Possible MQTT authentication results
 */

export const AuthenticationResult = {
  ok: 0,
  unacceptableProtocol: 1,
  rejectedUsername: 2,
  serverUnavailable: 3,
  badUsernameOrPassword: 4,
  notAuthorized: 5,
} as const;

export const AuthenticationResultByNumber: Record<number, string> = Object
  .fromEntries(
    Object.entries(AuthenticationResult).map(([k, v]) => [v, k]),
  );
