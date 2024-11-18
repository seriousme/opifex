import { Deferred, logger, MemoryStore, PacketType, } from "./deps.js";
import { Context } from "./context.js";
function generateClientId(prefix) {
    return `${prefix}-${Math.random().toString().slice(-10)}`;
}
function backOffSleep(random, attempt) {
    // based on https://dthain.blogspot.com/2009/02/exponential-backoff-in-distributed.html
    const factor = 1.5;
    const min = 1000;
    const max = 5000;
    const randomness = 1 + (random ? Math.random() : 0);
    const delay = Math.floor(Math.min(randomness * min * (factor ** attempt), max));
    logger.debug({ delay });
    return new Promise((resolve) => setTimeout(resolve, delay));
}
/**  the default MQTT URL to connect to */
export const DEFAULT_URL = "mqtt://localhost:1883/";
const DEFAULT_KEEPALIVE = 60; // 60 seconds
const DEFAULT_RETRIES = 3; // on first connect
const CLIENTID_PREFIX = "opifex"; // on first connect
/**
 * The Client class provides an MQTT Client that can be used to connect to
 * a MQTT broker and publish/subscribe messages.
 *
 * The Client class is not meant to be used directly, but
 * instead should be subclassed and the subclass should
 * override the createConn() method to provide a
 * connection type that is supported by the subclass.
 */
export class Client {
    clientIdPrefix = CLIENTID_PREFIX;
    numberOfRetries = DEFAULT_RETRIES;
    url = new URL(DEFAULT_URL);
    keepAlive = DEFAULT_KEEPALIVE;
    autoReconnect = true;
    caCerts;
    clientId;
    ctx = new Context(new MemoryStore());
    connectPacket;
    constructor() {
        this.clientId = generateClientId(this.clientIdPrefix);
        this.numberOfRetries = DEFAULT_RETRIES;
    }
    createConn(protocol, _hostname, _port, _caCerts) {
        // if you need to support alternative connection types just
        // overload this method in your subclass
        throw `Unsupported protocol: ${protocol}`;
    }
    async doConnect() {
        if (!this.connectPacket) {
            return;
        }
        let isReconnect = false;
        let attempt = 1;
        let lastMessage = new Error();
        let tryConnect = true;
        while (tryConnect) {
            logger.debug(`${isReconnect ? "re" : ""}connecting`);
            try {
                const conn = await this.createConn(this.url.protocol, this.url.hostname, Number(this.url.port) ?? undefined, this.caCerts);
                // if we get this far we have a connection
                tryConnect =
                    (await this.ctx.handleConnection(conn, this.connectPacket)) &&
                        this.autoReconnect;
                logger.debug({ tryConnect });
                isReconnect = true;
                this.connectPacket.clean = false;
                this.ctx.close();
            }
            catch (err) {
                if (err instanceof Error) {
                    lastMessage = err;
                }
                logger.debug(lastMessage);
                if (!isReconnect && attempt > this.numberOfRetries) {
                    tryConnect = false;
                }
                else {
                    await backOffSleep(true, attempt++);
                }
            }
        }
        if (isReconnect === false) {
            this.ctx.unresolvedConnect?.reject(lastMessage);
        }
    }
    connect(params = {}) {
        this.url = params?.url || this.url;
        this.numberOfRetries = params.numberOfRetries || this.numberOfRetries;
        this.caCerts = params?.caCerts;
        const options = Object.assign({
            keepAlive: this.keepAlive,
            clientId: this.clientId,
        }, params?.options);
        this.connectPacket = {
            type: PacketType.connect,
            ...options,
        };
        const deferred = new Deferred();
        this.ctx.unresolvedConnect = deferred;
        this.doConnect();
        return deferred.promise;
    }
    async disconnect() {
        await this.ctx.disconnect();
    }
    async publish(params) {
        const packet = {
            type: PacketType.publish,
            ...params,
        };
        await this.ctx.send(packet);
    }
    async subscribe(params) {
        const packet = {
            type: PacketType.subscribe,
            id: this.ctx.store.nextId(),
            ...params,
        };
        await this.ctx.send(packet);
    }
    async *messages() {
        yield* this.ctx.incoming;
    }
}
