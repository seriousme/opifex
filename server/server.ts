import { Context,  Handlers } from "./context.ts";
import {
  MemoryPersistence,
  AuthenticationResult,
  Persistence,
  SockConn,
  Topic,
  debug
} from "./deps.ts";

import { handlePacket } from "./handlers/handlePacket.ts";



const defaultIsAuthenticated = (
  ctx: Context,
  clientId: string,
  username: string,
  password: Uint8Array,
) => AuthenticationResult.ok;

const defaultIsAuthorized = (ctx: Context, topic: Topic) => true;

export class MqttServer {
  handlers: Handlers;
  persistence: Persistence;
  constructor(
    { persistence, handlers }: {
      persistence?: Persistence;
      handlers?: Handlers;
    },
  ) {
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
    if (conn.remoteAddr.transport === "tcp") {
      debug.log(`socket connected from ${conn.remoteAddr.hostname}`);
    }
    try {
      for await (const packet of ctx.mqttConn) {
        await handlePacket(ctx, packet);
      }
    } catch (err) {
      debug.log(`Error while serving:${err}`);
    } finally {
      ctx.close();
    }
  }
}

