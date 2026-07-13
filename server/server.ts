import { AuthenticationResult, logger, MemoryPersistence } from "./deps.ts";
import { Context } from "./context.ts";
import type { Handlers } from "./context.ts";
import type { IPersistence, SockConn, Topic } from "./deps.ts";
import { handlePacket } from "./handlers/handlePacket.ts";

/**
 * Default preconnect handler that unconditionally permits all connections.
 * @param {SockConn} _conn - The connection.
 * @returns {boolean} Always returns true
 */
const defaultPreconnect = (
  _conn: SockConn,
) => true;

/**
 * Default authentication handler that unconditionally permits all connections.
 * @param {Context} _ctx - The connection context.
 * @param {string} _clientId - The client identifier.
 * @param {string} _username - The username provided by the client.
 * @param {Uint8Array} _password - The password provided by the client.
 * @returns {AuthenticationResult} Always returns AuthenticationResult.ok.
 */
const defaultIsAuthenticated = (
  _ctx: Context,
  _clientId: string,
  _username: string,
  _password: Uint8Array,
) => AuthenticationResult.ok;

/**
 * Default authorization handler that unconditionally permits all topic operations.
 * @param {Context} _ctx - The connection context.
 * @param {Topic} _topic - The topic being accessed.
 * @returns {boolean} Always returns true.
 */
const defaultIsAuthorized = (_ctx: Context, _topic: Topic) => true;

/**
 * Configuration options for creating an MqttServer instance.
 */
export type MqttServerOptions = {
  /** Optional persistence layer implementation. Defaults to MemoryPersistence. */
  persistence?: IPersistence;
  /** Optional custom handlers for authentication and authorization. */
  handlers?: Handlers;
};

/** * The MqttServer class provides an MQTT server with configurable persistence and
 * authentication/authorization handlers.
 *
 * The default handlers are:
 * - isAuthenticated: always returns ok
 * - isAuthorizedToPublish: always returns true
 * - isAuthorizedToSubscribe: always returns true
 *
 * To customize the handlers, pass in a Handlers object.
 * To customize the persistence, pass in a Persistence object.
 */
export class MqttServer {
  /** The registered authentication and authorization handlers. */
  handlers: Handlers;
  /** The persistence layer used for storing sessions and messages. */
  persistence: IPersistence;

  /**
   * Initializes a new instance of the MqttServer.
   * * @param {MqttServerOptions} options - The configuration options for the server.
   */
  constructor({
    persistence,
    handlers,
  }: MqttServerOptions) {
    this.persistence = persistence || new MemoryPersistence();
    this.handlers = {
      preconnect: handlers?.preconnect || defaultPreconnect,
      isAuthenticated: handlers?.isAuthenticated || defaultIsAuthenticated,
      isAuthorizedToPublish: handlers?.isAuthorizedToPublish ||
        defaultIsAuthorized,
      isAuthorizedToSubscribe: handlers?.isAuthorizedToSubscribe ||
        defaultIsAuthorized,
    };
  }

  /**
   * Serve a new client connection.
   * @param {SockConn} conn - The socket connection to serve.
   * @returns {Promise<void>} A promise that resolves when the connection is closed.
   */
  async serve(conn: SockConn): Promise<void> {
    if (this.handlers.preconnect) {
      if (!await this.handlers.preconnect(conn)) {
        conn.close();
        return;
      }
    }
    const ctx = new Context(this.persistence, conn, this.handlers);
    if (conn.remoteAddr?.transport === "tcp") {
      logger.debug(`socket connected from ${conn.remoteAddr.hostname}`);
    }
    try {
      for await (const packet of ctx.mqttConn) {
        logger.debug("next packet");
        await handlePacket(ctx, packet);
      }
    } catch (err) {
      logger.debug(`Error while serving:${err}`);
    } finally {
      logger.debug(`done serving for ${ctx.clientId}`);
      ctx.close();
    }
  }

  /**
   * Close the server and all active client connections.
   * @param {boolean} cleanUp - If true, clean up client sessions on close.
   */
  close(cleanUp: boolean = false): void {
    logger.debug(`stopping mqttServer`);
    for (const [clientid, ctx] of Context.clientList) {
      logger.debug(`closing session for clientid: ${clientid}`);
      ctx.close();
      if (cleanUp) {
        ctx.clean();
      }
    }
  }
}
