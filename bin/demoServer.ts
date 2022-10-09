import {
  AuthenticationResult,
  Context,
  MqttServer,
  Topic,
} from "../server/mod.ts";
import { logger, LogLevel } from "../utils/utils.ts";

logger.level(LogLevel.info);

const utf8Decoder = new TextDecoder();
const localhost = "::";
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

/** MQTT server */
const port = Number(Deno.args[0]) || 1883;
const hostname = localhost;
const listener = Deno.listen({ hostname, port });
const mqttServer = new MqttServer({
  handlers: {
    isAuthenticated,
    isAuthorizedToPublish,
    isAuthorizedToSubscribe,
  },
});
if (listener.addr.transport === "tcp") {
  logger.info(
    `MQTT server is running on hostname: "${listener.addr.hostname}" port:${listener.addr.port}`,
  );
}

for await (const conn of listener) {
  mqttServer.serve(conn);
}
