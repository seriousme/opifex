import {
  logger,
  MqttConn,
  MQTTLevel,
  PacketNameByType,
  PacketType,
  Timer,
} from "./deps.ts";
import type {
  AnyPacket,
  ConnectPacket,
  IPersistence,
  ProtocolLevel,
  PublishPacket,
  PubrelPacket,
  SockConn,
  TAuthenticationResult,
  Topic,
} from "./deps.ts";

/** Unique identifier for an MQTT client. */
export type ClientId = string;

/** System topic prefix character used for internal MQTT system topics. */
export const SysPrefix = "$";

/** Standard UTF-8 encoder used across the server to convert strings to byte arrays. */
export const utf8Encoder = new TextEncoder();

/**
 * Handlers are hooks that the server will call
 * and let you influence the servers behaviour.
 * The following handlers can be configured:
 * - preconnect()
 * - isAuthenticated()
 * - isAuthorizedToPublish()
 * - isAuthorizedToSubscribe()
 */
export type Handlers = {
  /**
   * Default preconnect handler that unconditionally permits all connections.
   * @param {SockConn} conn - The connection context.
   * @param {SockAddr} localAddress- The local adress
   * @param {SockAddr} remoteAddress- The remote adress
   * @returns {boolean} fakse will close the connection
   */
  preconnect?(
    conn: SockConn,
  ): boolean | Promise<boolean>;

  /**
   * Hook to authenticate a client connection attempt.
   * @param {Context} ctx - The connection context.
   * @param {ClientId} clientId - The client identifier.
   * @param {string} username - The username provided by the client.
   * @param {Uint8Array} password - The password bytes provided by the client.
   * @param {ConnectPacket} connectPacket - The raw connect packet
   * @returns {TAuthenticationResult} The result of the authentication attempt.
   */
  isAuthenticated?(
    ctx: Context,
    clientId: ClientId,
    username: string,
    password: Uint8Array,
    connectPacket: ConnectPacket,
  ): TAuthenticationResult | Promise<TAuthenticationResult>;

  /**
   * Hook to authorize a message publication to a specific topic.
   * @param {Context} ctx - The connection context.
   * @param {Topic} topic - The topic the client wants to publish to.
   * @returns {boolean} True if the client is authorized to publish, false otherwise.
   */
  isAuthorizedToPublish?(
    ctx: Context,
    topic: Topic,
  ): boolean | Promise<boolean>;

  /**
   * Hook to authorize a subscription request to a specific topic.
   * @param {Context} ctx - The connection context.
   * @param {Topic} topic - The topic filter the client wants to subscribe to.
   * @returns {boolean} True if the client is authorized to subscribe, false otherwise.
   */
  isAuthorizedToSubscribe?(
    ctx: Context,
    topic: Topic,
  ): boolean | Promise<boolean>;
};

/**
 * Per-connection server context that manages the lifecycle, packets,
 * timers, and persistence interactions for an individual client connection.
 */
export class Context {
  /** the client id is set after succesful connect */
  clientId: ClientId | null = null;

  /** Indicates whether the client has successfully completed the MQTT CONNECT handshake. */
  connected = false;

  /** Indicates whether the client asked for a clean session */
  cleanSession = false;

  /** Indicates whether the client is considered a broker and allowed  to use $SYS topics etc */
  isBroker = false;

  /** The MQTT protocol level version determined during the connection handshake. */
  protocolLevel: ProtocolLevel;

  /** The underlying raw socket connection. */
  conn: SockConn;

  /** The wrapped MQTT connection wrapper handling frame reading and writing. */
  mqttConn: MqttConn;

  /** The persistence layer instance used by the server. */
  persistence: IPersistence;

  /** The configured authentication and authorization lifecycle hooks. */
  handlers: Handlers;

  /** Global registry mapping active client identifiers to their respective connection context. */
  static clientList: Map<ClientId, Context> = new Map();

  /** The optional Will packet configured by the client to be published if disconnected unexpectedly. */
  will?: PublishPacket | undefined;

  /** The Keep Alive timer tracking the client activity timeout. */
  timer?: Timer;

  /** Timer enforcing a deadline for the client to send a CONNECT packet after establishing a socket connection. */
  preconnectTimer?: Timer;

  /** The default timeout limit in milliseconds for a client to complete the connection handshake. */
  static preconnectTimeoutMs: number = 3000; // 3 seconds

  /**
   * Initializes a new instance of the connection Context.
   */
  constructor(
    persistence: IPersistence, // The server persistence layer implementation.
    conn: SockConn, // The underlying socket connection.
    handlers: Handlers, // The validation handlers
  ) {
    this.persistence = persistence;
    this.conn = conn;
    this.mqttConn = new MqttConn({ conn });
    this.handlers = handlers;
    this.protocolLevel = MQTTLevel.unknown;
    this.initializePreconnectTimer(Context.preconnectTimeoutMs);
  }

  /**
   * Configures and starts the preconnect timer to enforce connection deadlines.
   */
  private initializePreconnectTimer(preconnectTimeoutMs: number): void {
    this.preconnectTimer = new Timer(() => {
      if (!this.connected) {
        logger.warn(
          `Preconnect timeout: client at ${this.mqttConn.remoteAddress} failed to connect within ${
            preconnectTimeoutMs / 1000
          } seconds`,
        );
        this.close(false);
      }
    }, preconnectTimeoutMs);
  }

  /**
   * Transmits an MQTT packet to the client.
   */
  async send(packet: AnyPacket): Promise<void> {
    logger.verbose(
      `ctx.send: Sending packet of type ${
        PacketNameByType[packet.type]
      } to client ${this.clientId!}`,
    );
    if ((!this.mqttConn.isClosed)) {
      logger.debug(`ctx.send: ${JSON.stringify(packet, null, 2)}`);
      await this.mqttConn.send(packet);
      if (this.mqttConn.isClosed) {
        await this.close();
      }
    }
  }

  /**
   * Finalizes the client connection state, registers the client in persistence,
   * kicks out existing duplicate sessions, and broadcasts the client connection event.
   */
  async connect(clientId: string, clean: boolean): Promise<boolean> {
    logger.verbose("ctx:connect connecting", clientId);
    this.clientId = clientId;
    this.cleanSession = clean;
    if (this.preconnectTimer) {
      this.preconnectTimer.clear();
    }
    const existingActiveSession = Context.clientList.get(clientId);
    if (existingActiveSession) {
      logger.verbose(
        `ctx:connect: Existing session with ${clientId} exists, closing existing session`,
      );
      await existingActiveSession.close(false);
    }
    if (clean) {
      logger.verbose(
        `ctx:connect: Clean session requested for ${clientId}, deregistering existing state`,
      );
      await this.persistence.deregisterClient(clientId);
    }
    logger.verbose("ctx:connect: Registering client", clientId);
    const { existingSession } = await this.persistence.registerClient(
      clientId,
      this.send.bind(this),
    );
    this.connected = true;
    Context.clientList.set(clientId, this);
    logger.verbose("ctx:connect: Broadcasting client connection", clientId);
    await this.broadcast("$SYS/connect/clients", clientId);
    const remoteAddress = this.mqttConn.remoteAddress !== "unknown"
      ? ` from ${this.mqttConn.remoteAddress}`
      : "";
    logger.info(`Connected "${clientId}"${remoteAddress}`);
    return existingSession;
  }

  /**
   * Processes -inbound- publication requests
   */
  async publish(packet: PublishPacket) {
    logger.verbose(
      `ctx:publish processing incoming publish for topic "${packet.topic}"`,
    );
    await this.persistence.publish(this.clientId!, packet.topic, packet);
  }

  /**
   * Explicitly removes a client session and its stored state from the persistence layer.
   */
  async clean() {
    if (this.clientId) {
      await this.persistence.deregisterClient(this.clientId);
    }
    await this.close(false);
  }

  /**
   * Tears down the connection context, terminates the underlying socket,
   * clears internal timers, triggers the Will packet execution if requested,
   * and announces the client disconnection.
   * If executewill=true triggers the registered Will packet logic.
   */
  async close(executewill = true): Promise<void> {
    logger.debug(`server closing context ${this.connected}`);
    if (this.preconnectTimer) {
      this.preconnectTimer.clear();
    }
    if (this.connected) {
      if (this.cleanSession) {
        // [MQTT-3.1.2-6] State data associated with this Session MUST NOT be reused in any subsequent Session
        if (this.clientId) {
          await this.persistence.deregisterClient(this.clientId);
        }
      }
      logger.info(
        `Closing ${this.clientId} while mqttConn is ${
          this.mqttConn.isClosed ? "" : "not "
        }closed because of "${this.mqttConn.reason || "normal disconnect"}"`,
      );
      this.connected = false;
      if (typeof this.timer === "object") {
        this.timer.clear();
      }
      if (executewill) {
        await this.handleWill();
      }
      if (this.clientId) {
        await this.persistence.disconnectClient(this.clientId);
        void this.broadcast("$SYS/disconnect/clients", this.clientId);
        Context.clientList.delete(this.clientId);
      }
    } else {
      logger.debug(
        `closing connection from ${this.mqttConn.remoteAddress} because of "${
          this.mqttConn.reason || "normal disconnect"
        }"`,
      );
    }
    if (!this.mqttConn.isClosed) {
      this.mqttConn.close();
    }
  }

  /**
   * Evaluates authorization and triggers the distribution of the client's Will packet.
   */
  private async handleWill() {
    if (this.will) {
      if (
        !this.will.topic.startsWith(SysPrefix) &&
        this.handlers.isAuthorizedToPublish &&
        await this.handlers.isAuthorizedToPublish(this, this.will.topic)
      ) {
        await this.publish(this.will);
      }
    }
  }

  /**
   * Utility method to generate and publish an internal system message payload to the persistence engine.
   */
  async broadcast(
    topic: Topic, // The topic filter string to publish to.
    payload: string, // The plain-text message string to encode.
    retain = false, // Specifies if the message should be retained.
  ): Promise<void> {
    const packet: PublishPacket = {
      type: PacketType.publish,
      protocolLevel: this.protocolLevel,
      topic,
      retain,
      payload: utf8Encoder.encode(payload),
    };
    await this.publish(packet);
  }

  /**
   * utility method to redeliver packets that were cached
   * called from handleConnect()
   */
  async handleRedelivery() {
    // redeliver inflight data
    const clientId = this.clientId!;
    const p = this.persistence;

    logger.verbose(`ctx:handleRedelivery for ${this.clientId}`);
    for await (const packet of p.listPendingOutgoingPackets(clientId)) {
      if (!this.connected) {
        break;
      }
      this.send(packet);
    }
    // we only need to resend QoS2 PubRel acks
    for await (const packetId of p.listPendingAcks(clientId)) {
      if (!this.connected) {
        break;
      }
      const pubrel: PubrelPacket = {
        protocolLevel: this.protocolLevel,
        type: PacketType.pubrel,
        id: packetId,
      };
      this.send(pubrel);
    }
  }
}
