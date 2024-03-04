import { AuthenticationResult, Context, Topic } from "../server/mod.ts";
import { DenoServer } from "../deno/server.ts";
import { logger, LogLevel } from "../utils/utils.ts";

const utf8Decoder = new TextDecoder();
const userTable = new Map();
userTable.set("IoTester_1", "strong_password");
userTable.set("IoTester_2", "strong_password");
// const strictUsername = new RegExp(/^[a-zA-Z0-9]{0,23}$/);

function isAuthenticated(
  _ctx: Context,
  clientId: string,
  username: string,
  password: Uint8Array,
): AuthenticationResult {
  const pwd = utf8Decoder.decode(password);
  logger.info(
    `Verifying authentication of client '${clientId}' with username '${username}' and password '${pwd}'`,
  );

  return AuthenticationResult.ok;
  // if (!userTable.has(username)) {
  //   if (!strictUsername.test(username)) {
  //     return AuthenticationResult.badUsernameOrPassword;
  //   }
  // }

  // const pass = userTable.get(username);
  // if (pwd === pass) {
  //   return AuthenticationResult.ok;
  // }
  // return AuthenticationResult.badUsernameOrPassword;
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

/** start the server **/

const port = Number(Deno.args[0]) || 1883;
const hostname = "::";
logger.level(LogLevel.info);
const denoServer = new DenoServer({ port, hostname }, {
  handlers: {
    isAuthenticated,
    isAuthorizedToPublish,
    isAuthorizedToSubscribe,
  },
});
denoServer.start();
logger.info(`Server started on port ${denoServer.port}`);
