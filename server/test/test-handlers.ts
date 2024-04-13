import { AuthenticationResult, type Context, type Topic } from "../mod.ts";
import { logger } from "../../utils/mod.ts";

const utf8Decoder = new TextDecoder();
const userTable = new Map();
userTable.set("IoTester_1", "strong_password");
userTable.set("IoTester_2", "strong_password");
const strictUsername = new RegExp(/^[a-zA-Z0-9]{0,23}$/);

function isAuthenticated(
  _ctx: Context,
  clientId: string,
  username: string,
  password: Uint8Array,
): AuthenticationResult {
  const pwd = utf8Decoder.decode(password);
  logger.debug(
    `Verifying authentication of client '${clientId}' with username '${username}' and password '${pwd}'`,
  );

  if (!userTable.has(username)) {
    if (!strictUsername.test(username)) {
      return AuthenticationResult.badUsernameOrPassword;
    }
  }

  const pass = userTable.get(username);
  if (pwd === pass) {
    return AuthenticationResult.ok;
  }
  return AuthenticationResult.badUsernameOrPassword;
}

function isAuthorizedToPublish(ctx: Context, topic: Topic): boolean {
  logger.debug(
    `Checking authorization of client '${ctx.store?.clientId}' to publish on topic '${topic}'`,
  );
  return true;
}
function isAuthorizedToSubscribe(ctx: Context, topic: Topic): boolean {
  logger.debug(
    `Checking authorization of client '${ctx.store?.clientId}' to subscribe to topic '${topic}'`,
  );
  return true;
}

export const handlers = {
  isAuthenticated,
  isAuthorizedToPublish,
  isAuthorizedToSubscribe,
};
