import { Context, Handlers } from "./context.ts";
import {
  AuthenticationResult,
  IPersistence,
  logger,
  MemoryPersistence,
  SockConn,
  Topic,
} from "./deps.ts";

import { handlePacket } from "./handlers/handlePacket.ts";

const defaultIsAuthenticated = (
  _ctx: Context,
  _clientId: string,
  _username: string,
  _password: Uint8Array,
) => AuthenticationResult.ok;

const defaultIsAuthorized = (_ctx: Context, _topic: Topic) => true;

/**
 * The options to configure the MqttServer
 */
export type MqttServerOptions = {
  persistence?: IPersistence;
  handlers?: Handlers;
};

/** The MqttServer class provides a MQTT server with configurable persistence and
 * authentication/authorization handlers.
 *
 * The default handlers are:
 *  - isAuthenticated: always returns ok
 *  - isAuthorizedToPublish: always returns true
 *  - isAuthorizedToSubscribe: always returns true
 *
 * To customize the handlers, pass in a Handlers object.
 * To customize the persistence, pass in a Persistence object.
 */

export class MqttServer {
  handlers: Handlers;
  persistence: IPersistence;
  constructor({
    persistence,
    handlers,
  }: MqttServerOptions) {
    this.persistence = persistence || new MemoryPersistence();
    this.handlers = {
      isAuthenticated: handlers?.isAuthenticated || defaultIsAuthenticated,
      isAuthorizedToPublish: handlers?.isAuthorizedToPublish ||
        defaultIsAuthorized,
      isAuthorizedToSubscribe: handlers?.isAuthorizedToSubscribe ||
        defaultIsAuthorized,
    };
  }

  async serve(conn: SockConn): Promise<void> {
    const ctx = new Context(this.persistence, conn, this.handlers);
    if (conn.remoteAddr?.transport === "tcp") {
      logger.debug(`socket connected from ${conn.remoteAddr.hostname}`);
    }
    try {
      for await (const packet of ctx.mqttConn) {
        handlePacket(ctx, packet);
      }
    } catch (err) {
      logger.debug(`Error while serving:${err}`);
    } finally {
      ctx.close();
    }
  }
}
