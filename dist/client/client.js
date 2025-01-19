import { Deferred, logger, MemoryStore, PacketType, } from "./deps.js";
import { Context } from "./context.js";
/**
 * Generates a random client ID with the given prefix
 * @param prefix - The prefix to use for the client ID
 * @returns A string containing the prefix followed by a random number
 */
function generateClientId(prefix) {
    return `${prefix}-${Math.random().toString().slice(-10)}`;
}
/**
 * Implements exponential backoff sleep with optional randomization
 * @param random - Whether to add randomization to the delay
 * @param attempt - The attempt number (used to calculate delay)
 * @returns Promise that resolves after the calculated delay
 */
function backOffSleep(random, attempt) {
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
    cert;
    key;
    clientId;
    ctx = new Context(new MemoryStore());
    connectPacket;
    /**
     * Creates a new MQTT client instance
     */
    constructor() {
        this.clientId = generateClientId(this.clientIdPrefix);
        this.numberOfRetries = DEFAULT_RETRIES;
    }
    /**
     * Creates a new connection to the MQTT broker
     * @param protocol - The protocol to use (mqtt, mqtts, etc)
     * @param _hostname - The hostname to connect to
     * @param _port - The port to connect to
     * @param _caCerts - Optional CA certificates
     * @param _cert - Optional client certificate
     * @param _key - Optional client key
     * @returns Promise resolving to a SockConn connection
     */
    createConn(protocol, _hostname, _port, _caCerts, _cert, _key) {
        throw `Unsupported protocol: ${protocol}`;
    }
    /**
     * Handles the connection process including retries and reconnection
     * @returns Promise that resolves when connection is established or fails
     */
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
                const conn = await this.createConn(this.url.protocol, this.url.hostname, Number(this.url.port) ?? undefined, this.caCerts, this.cert, this.key);
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
    /**
     * Connects to the MQTT broker
     * @param params - Connection parameters
     * @returns Promise resolving to authentication result
     */
    connect(params = {}) {
        this.url = params?.url || this.url;
        this.numberOfRetries = params.numberOfRetries || this.numberOfRetries;
        this.caCerts = params?.caCerts;
        this.cert = params?.cert;
        this.key = params?.key;
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
    /**
     * Disconnects from the MQTT broker
     * @returns Promise that resolves when disconnected
     */
    async disconnect() {
        await this.ctx.disconnect();
    }
    /**
     * Publishes a message to the MQTT broker
     * @param params - Publish parameters including topic and payload
     * @returns Promise that resolves when published
     */
    async publish(params) {
        const packet = {
            type: PacketType.publish,
            ...params,
        };
        await this.ctx.publish(packet);
    }
    /**
     * Subscribes to topics on the MQTT broker
     * @param params - Subscribe parameters including topics
     * @returns Promise that resolves when subscribed
     */
    async subscribe(params) {
        const packet = {
            type: PacketType.subscribe,
            id: 0, //placeholder
            ...params,
        };
        await this.ctx.subscribe(packet);
    }
    /**
     * Gets an async iterator for received messages
     * @returns AsyncGenerator yielding received publish packets
     */
    async *messages() {
        yield* this.ctx.incoming;
    }
    /**
     * Closes the message stream
     * @param reason - Optional reason for closing
     */
    closeMessages(reason) {
        this.ctx.incoming.close(reason);
    }
}
