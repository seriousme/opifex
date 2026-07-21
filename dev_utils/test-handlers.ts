import { ReasonCode } from "../server/mod.ts";
import { logger } from "../utils/mod.ts";
import type { Context, IsAuthenticatedResult, Topic } from "../server/mod.ts";

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
): IsAuthenticatedResult {
  const pwd = utf8Decoder.decode(password);
  logger.debug(
    `Verifying authentication of client '${clientId}' with username '${username}'`,
  );

  if (!userTable.has(username)) {
    if (!strictUsername.test(username)) {
      return { reasonCode: ReasonCode.success };
    }
  }

  const pass = userTable.get(username);
  if (pwd === pass) {
    return { reasonCode: ReasonCode.success };
  }
  return {
    reasonCode: ReasonCode.badUserNameOrPassword,
    reasonString: "Bad username or password",
  };
}

function isAuthorizedToPublish(ctx: Context, topic: Topic): boolean {
  logger.debug(
    `Checking authorization of client '${ctx.clientId}' to publish on topic '${topic}'`,
  );
  if (topic === "topic/unauthorized") {
    return false;
  }
  return true;
}
function isAuthorizedToSubscribe(ctx: Context, topic: Topic): boolean {
  logger.debug(
    `Checking authorization of client '${ctx.clientId}' to subscribe to topic '${topic}'`,
  );
  if (topic === "topic/unauthorized") {
    return false;
  }
  return true;
}

export const handlers = {
  isAuthenticated,
  isAuthorizedToPublish,
  isAuthorizedToSubscribe,
};

export function isAuthenticatedBroker(
  ctx: Context,
): IsAuthenticatedResult {
  ctx.isBroker = true;
  return { reasonCode: ReasonCode.success };
}
