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
};
export const AuthenticationResultByNumber = Object.fromEntries(Object.entries(AuthenticationResult).map(([k, v]) => [v, k]));
