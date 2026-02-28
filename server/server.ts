import { AuthenticationResult, logger, MemoryPersistence } from "./deps.ts";
import { Context } from "./context.ts";
import type { Handlers } from "./context.ts";
import type { IPersistence, SockConn, Topic } from "./deps.ts";
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
  #activeContexts = new Set<Context>();
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

  /**
   * Forcefully closes all active connections and stops their serve loops
   */
  stop() {
    for (const ctx of this.#activeContexts) {
      ctx.close(); 
    }
    this.#activeContexts.clear();
  }

  async serve(conn: SockConn): Promise<void> {
    const ctx = new Context(this.persistence, conn, this.handlers);
    this.#activeContexts.add(ctx);
    if (conn.remoteAddr?.transport === "tcp") {
      logger.debug(`socket connected from ${conn.remoteAddr.hostname}`);
    }
    try {
      for await (const packet of ctx.mqttConn) {
        await handlePacket(ctx, packet);
      }
    } catch (err) {
      logger.debug(`Error while serving:${err}`);
    } finally {
      this.#activeContexts.delete(ctx);
      if (!ctx.mqttConn.isClosed) {
        ctx.close();
      }
      logger.debug(`server disconnected ${ctx.store?.clientId || "unknown client"}`);
    }
  }
}
