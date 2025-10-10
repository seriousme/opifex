import {
  Deferred,
  logger,
  MemoryStore,
  MQTTLevel,
  PacketType,
} from "./deps.ts";

import type {
  AnyPacket,
  ConnectPacket,
  PublishPacket,
  SockConn,
  SubscribePacket,
  TAuthenticationResult,
} from "./deps.ts";

import { noop } from "../utils/utils.ts";

import { Context } from "./context.ts";
import type { TConnectionState } from "./ConnectionState.ts";
import { assert } from "../utils/assert.ts";
import { BufferedAsyncIterable } from "./deps.ts";

/**
 * Generates a random client ID with the given prefix
 * @param prefix - The prefix to use for the client ID
 * @returns A string containing the prefix followed by a random number
 */
function generateClientId(prefix: string): string {
  return `${prefix}-${Math.random().toString().slice(-10)}`;
}

type ConnectOptions = Omit<
  ConnectPacket,
  "type" | "protocolName"
>;

/** ConnectParameters define how to connect */
export type ConnectParameters = {
  url?: URL;
  caCerts?: string[];
  cert?: string;
  key?: string;
  numberOfRetries?: number;
  options?: ConnectOptions;
};

/** PublishParameters define how a message should be published */
export type PublishParameters = Omit<
  PublishPacket,
  "type" | "id" | "protocolLevel"
>;
/** SubscribeParameters define how to subscribe to a topic */
export type SubscribeParameters = Omit<
  SubscribePacket,
  "type" | "id" | "protocolLevel"
>;

/**
 * Implements exponential backoff sleep with optional randomization
 * based on https://dthain.blogspot.com/2009/02/exponential-backoff-in-distributed.html
 * @param random - Whether to add randomization to the delay
 * @param attempt - The attempt number (used to calculate delay)
 * @returns Promise that resolves after the calculated delay
 */
function backOffSleep(random: boolean, attempt: number): Promise<void> {
  const factor = 1.5;
  const min = 1000;
  const max = 5000;
  const randomness = 1 + (random ? Math.random() : 0);
  const delay = Math.floor(
    Math.min(randomness * min * (factor ** attempt), max),
  );
  logger.debug({ delay });
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/** the default MQTT URL to connect to */
export const DEFAULT_URL = "mqtt://localhost:1883/";
/** the default protocol level to connect with*/
export const DEFAULT_PROTOCOLLEVEL = MQTTLevel.v4;
/** the default keepalive time */
export const DEFAULT_KEEPALIVE = 60; // 60 seconds
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

  public onError: (err: Error) => void = noop;
  public onPacket: (pkt: PublishPacket) => void | Promise<void> = noop;
  public onConnected: () => void = noop;
  public onDisconnected: () => void = noop;
  public onReconnecting: () => void = noop;

  protected clientIdPrefix = CLIENTID_PREFIX;
  protected numberOfRetries = DEFAULT_RETRIES;
  protected url: URL = new URL(DEFAULT_URL);
  protected keepAlive = DEFAULT_KEEPALIVE;
  protected protocolLevel = DEFAULT_PROTOCOLLEVEL;
  protected autoReconnect = true;
  private caCerts?: string[];
  private cert?: string;
  private key?: string;
  private clientId: string;
  private ctx: Context;
  private connectPacket?: ConnectPacket;

  /**
   * Creates a new MQTT client instance
   */
  constructor() {
    this.ctx = new Context(new MemoryStore(), this);
    this.clientId = generateClientId(this.clientIdPrefix);
    this.numberOfRetries = DEFAULT_RETRIES;
  }

  get connectionState(): TConnectionState {
    return this.ctx.connectionState;
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
  protected createConn(
    protocol: string,
    _hostname: string,
    _port?: number,
    _caCerts?: string[],
    _cert?: string,
    _key?: string,
  ): Promise<SockConn> {
    // if you need to support alternative connection types just
    // overload this method in your subclass
    throw new Error(`Unsupported protocol: ${protocol}`);
  }

  /**
   * Handles the connection process including retries and reconnection
   * @returns Promise that resolves when connection is established or fails
   */
  private async doConnect(): Promise<void> {
    if (!this.connectPacket) {
      return;
    }

    let isReconnect = false;
    let attempt = 1;
    let lastMessage = new Error();
    let tryConnect = true;
    while (tryConnect) {
      logger.debug(`${isReconnect ? "re" : ""}connecting, attempt ${attempt}`);
      try {
        const conn = await this.createConn(
          this.url.protocol,
          this.url.hostname,
          Number(this.url.port) ?? undefined,
          this.caCerts,
          this.cert,
          this.key,
        );
        // if we get this far we have a connection
        tryConnect =
          (await this.ctx.handleConnection(conn, this.connectPacket)) &&
          this.autoReconnect;
        logger.debug({ tryConnect });
        isReconnect = true;
        this.connectPacket.clean = false;
        this.ctx.close();
      } catch (err) {
        assert(
          err instanceof Error,
          `Caught something that is not an instance of Error: ${err}`,
        );
        queueMicrotask(() => this.onError(err));
        lastMessage = err;
        logger.debug({ lastMessage });
      }

      if (tryConnect && (isReconnect || attempt < this.numberOfRetries)) {
        await backOffSleep(true, attempt);
        if (!isReconnect) {
          attempt++;
        }
        queueMicrotask(this.onReconnecting);
      } else {
        tryConnect = false;
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
  connect(params: ConnectParameters = {}): Promise<TAuthenticationResult> {
    this.url = params?.url || this.url;
    this.numberOfRetries = params.numberOfRetries || this.numberOfRetries;
    this.caCerts = params?.caCerts;
    this.cert = params?.cert;
    this.key = params?.key;
    const options = Object.assign(
      {
        keepAlive: this.keepAlive,
        clientId: this.clientId,
        protocolLevel: this.protocolLevel,
      },
      params?.options,
    );
    this.connectPacket = {
      type: PacketType.connect,
      ...options,
    };
    const deferred = new Deferred<TAuthenticationResult>();
    this.ctx.unresolvedConnect = deferred;
    this.doConnect();
    return deferred.promise;
  }

  /**
   * Disconnects from the MQTT broker
   * @returns Promise that resolves when disconnected
   */
  async disconnect(): Promise<void> {
    await this.ctx.disconnect();
  }

  /**
   * Publishes a message to the MQTT broker
   * @param params - Publish parameters including topic and payload
   * @returns Promise that resolves when published
   */
  async publish(params: PublishParameters): Promise<void> {
    const packet: PublishPacket = {
      type: PacketType.publish,
      protocolLevel: this.ctx.protocolLevel,
      ...params,
    };
    await this.ctx.publish(packet);
  }

  /**
   * Subscribes to topics on the MQTT broker
   * @param params - Subscribe parameters including topics
   * @returns Promise that resolves when subscribed
   */
  async subscribe(params: SubscribeParameters): Promise<void> {
    const packet: SubscribePacket = {
      type: PacketType.subscribe,
      id: 0, //placeholder
      protocolLevel: this.ctx.protocolLevel,
      ...params,
    };
    await this.ctx.subscribe(packet);
  }

  /**
   * Gets an async iterator for received messages
   * @returns AsyncGenerator yielding received publish packets
   */
  messages(): AsyncIterable<PublishPacket> {
    const bufferedIterable = new BufferedAsyncIterable<PublishPacket>();
    this.onPacket = bufferedIterable.push;
    return bufferedIterable;
  }

}
