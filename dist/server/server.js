import { Context } from "./context.js";
import { AuthenticationResult, logger, MemoryPersistence, } from "./deps.js";
import { handlePacket } from "./handlers/handlePacket.js";
const defaultIsAuthenticated = (_ctx, _clientId, _username, _password) => AuthenticationResult.ok;
const defaultIsAuthorized = (_ctx, _topic) => true;
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
    handlers;
    persistence;
    constructor({ persistence, handlers, }) {
        this.persistence = persistence || new MemoryPersistence();
        this.handlers = {
            isAuthenticated: handlers?.isAuthenticated || defaultIsAuthenticated,
            isAuthorizedToPublish: handlers?.isAuthorizedToPublish ||
                defaultIsAuthorized,
            isAuthorizedToSubscribe: handlers?.isAuthorizedToSubscribe ||
                defaultIsAuthorized,
        };
    }
    async serve(conn) {
        const ctx = new Context(this.persistence, conn, this.handlers);
        if (conn.remoteAddr?.transport === "tcp") {
            logger.debug(`socket connected from ${conn.remoteAddr.hostname}`);
        }
        try {
            for await (const packet of ctx.mqttConn) {
                handlePacket(ctx, packet);
            }
        }
        catch (err) {
            logger.debug(`Error while serving:${err}`);
        }
        finally {
            ctx.close();
        }
    }
}
