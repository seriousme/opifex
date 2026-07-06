import { logger, MqttConn, MQTTLevel, PacketType, Timer } from "./deps.ts";
import type {
  AnyPacket,
  ConnectPacket,
  IPersistence,
  IStore,
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
 * - isAuthenticated()
 * - isAuthorizedToPublish()
 * - isAuthorizedToSubscribe()
 */
export type Handlers = {
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
  ): TAuthenticationResult;

  /**
   * Hook to authorize a message publication to a specific topic.
   * @param {Context} ctx - The connection context.
   * @param {Topic} topic - The topic the client wants to publish to.
   * @returns {boolean} True if the client is authorized to publish, false otherwise.
   */
  isAuthorizedToPublish?(ctx: Context, topic: Topic): boolean;

  /**
   * Hook to authorize a subscription request to a specific topic.
   * @param {Context} ctx - The connection context.
   * @param {Topic} topic - The topic filter the client wants to subscribe to.
   * @returns {boolean} True if the client is authorized to subscribe, false otherwise.
   */
  isAuthorizedToSubscribe?(ctx: Context, topic: Topic): boolean;
};

/**
 * Per-connection server context that manages the lifecycle, packets,
 * timers, and persistence interactions for an individual client connection.
 */
export class Context {
  /** Indicates whether the client has successfully completed the MQTT CONNECT handshake. */
  connected = false;

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

  /** The client-specific persistence store instance. Set after a successful connect. */
  store?: IStore;

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
   * @param {IPersistence} persistence - The server persistence layer implementation.
   * @param {SockConn} conn - The underlying socket connection.
   * @param {Handlers} handlers - The hooks to influence server behavior.
   */
  constructor(
    persistence: IPersistence,
    conn: SockConn,
    handlers: Handlers,
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
   * @param {number} preconnectTimeoutMs - The timeout limit in milliseconds.
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
   * Serializes and transmits an MQTT packet over the connection.
   * @param {AnyPacket} packet - The packet to be sent.
   * @returns {Promise<void>} A promise that resolves when transmission completes.
   */
  async send(packet: AnyPacket): Promise<void> {
    if (!this.connected) {
      return;
    }
    logger.debug(`ctx.send: $JSON.stringify(packet, null, 2)`);
    await this.mqttConn.send(packet);
  }

  /**
   * Finalizes the client connection state, registers the client in persistence,
   * kicks out existing duplicate sessions, and broadcasts the client connection event.
   * @param {string} clientId - The unique identifier of the connecting client.
   * @param {boolean} clean - Indicates whether a clean session is requested.
   * @returns {Promise<boolean>} Resolves to true if an existing session was taken over, false otherwise.
   */
  async connect(clientId: string, clean: boolean): Promise<boolean> {
    logger.debug("Connecting", clientId);
    if (this.preconnectTimer) {
      this.preconnectTimer.clear();
    }
    const existingActiveSession = Context.clientList.get(clientId);
    if (existingActiveSession) {
      logger.debug(
        `Existing session with ${clientId} exists, closing existing session`,
      );
      existingActiveSession.close(false);
    }

    const { store, existingSession } = await this.persistence.registerClient(
      clientId,
      this.doPublish.bind(this),
      clean,
    );
    this.store = store;
    this.connected = true;
    Context.clientList.set(clientId, this);
    await this.broadcast("$SYS/connect/clients", clientId);
    logger.debug("Connected", clientId);
    return existingSession;
  }

  /**
   * Processes outbound publication requests, allocating package IDs and storing
   * unacknowledged QoS > 0 packets into the client persistence layer.
   * @param {PublishPacket} packet - The publication packet to distribute.
   * @returns {Promise<void>} A promise that resolves when the internal processing or send queue finishes.
   */
  async doPublish(packet: PublishPacket): Promise<void> {
    const qos = packet.qos || 0;
    if (qos === 0) {
      packet.id = 0;
      this.send(packet);
      return;
    }
    if (this.store) {
      packet.id = await this.store.nextId();
      this.store.pendingOutgoing.set(packet.id, packet);
      this.send(packet);
    }
  }

  /**
   * Explicitly removes a client session and its stored state from the persistence layer.
   * @param {string} clientId - The identifier of the client to clean up.
   * @returns {Promise<void>}
   */
  async clean(clientId: string) {
    await this.persistence.deregisterClient(clientId);
  }

  /**
   * Tears down the connection context, terminates the underlying socket,
   * clears internal timers, triggers the Will packet execution if requested,
   * and announces the client disconnection.
   * @param {boolean} [executewill=true] - If true, triggers the registered Will packet logic.
   */
  close(executewill = true): void {
    logger.debug(`server closing context ${this.connected}`);
    if (this.preconnectTimer) {
      this.preconnectTimer.clear();
    }
    if (this.connected) {
      logger.info(
        `Closing ${this.store?.clientId} while mqttConn is ${
          this.mqttConn.isClosed ? "" : "not "
        }closed because of "${this.mqttConn.reason || "normal disconnect"}"`,
      );
      this.connected = false;
      if (typeof this.timer === "object") {
        this.timer.clear();
      }
      if (this.store) {
        void this.broadcast("$SYS/disconnect/clients", this.store.clientId);
      }
      if (executewill) {
        void this.handleWill();
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
        this.handlers.isAuthorizedToPublish(this, this.will.topic)
      ) {
        await this.persistence.publish(this.will.topic, this.will);
      }
    }
  }

  /**
   * Utility method to generate and publish an internal system message payload to the persistence engine.
   * @param {Topic} topic - The topic filter string to publish to.
   * @param {string} payload - The plain-text message string to encode.
   * @param {boolean} [retain=false] - Specifies if the message should be retained.
   * @returns {Promise<void>}
   */
  async broadcast(
    topic: Topic,
    payload: string,
    retain = false,
  ): Promise<void> {
    const packet: PublishPacket = {
      type: PacketType.publish,
      protocolLevel: this.protocolLevel,
      topic,
      retain,
      payload: utf8Encoder.encode(payload),
    };
    await this.persistence.publish(packet.topic, packet);
  }

  /**
   * utility method to redeliver packets that were cached
   * called from handleConnect()
   */
  async handleRedelivery() {
    // redeliver inflight data
    if (this.store) {
      for await (const packet of this.store.pendingOutgoing.values()) {
        if (!this.connected) {
          break;
        }
        this.send(packet);
      }
      // we only need to resend PubRel acks
      for await (const packetId of this.store.pendingAckOutgoing.keys()) {
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
}
