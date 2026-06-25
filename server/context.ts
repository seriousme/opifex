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
  IPersistence,
  IStore,
  ProtocolLevel,
  PublishPacket,
  SockConn,
  TAuthenticationResult,
  Topic,
} from "./deps.ts";

export type ClientId = string;

export const SysPrefix = "$";

export const utf8Encoder = new TextEncoder();

/**
 * Handlers are hooks that the server will call
 * and let you influence the servers behaviour.
 * The following handlers can be configured:
 *  - isAuthenticated()
 *  - isAuthorizedToPublish()
 *  - isAuthorizedToSubscribe()
 */
export type Handlers = {
  isAuthenticated?(
    ctx: Context,
    clientId: ClientId,
    username: string,
    password: Uint8Array,
  ): TAuthenticationResult;
  isAuthorizedToPublish?(ctx: Context, topic: Topic): boolean;
  isAuthorizedToSubscribe?(ctx: Context, topic: Topic): boolean;
};

/**
 * The Context class is used to maintain state of a MQTT connection
 * It handles:
 *  - connect/disconnect including broadcasting of these events
 *  - publish
 *  - persistence
 *  - the will
 */

export class Context {
  connected: boolean;
  protocolLevel: ProtocolLevel;
  conn: SockConn;
  mqttConn: MqttConn;
  persistence: IPersistence;
  handlers: Handlers;
  static clientList: Map<ClientId, Context> = new Map();
  store?: IStore;
  will?: PublishPacket | undefined;
  timer?: Timer;
  preconnectTimer?: Timer;
  static preconnectTimeoutMs: number = 3000; // 3 seconds

  constructor(persistence: IPersistence, conn: SockConn, handlers: Handlers) {
    this.persistence = persistence;
    this.connected = false;
    this.conn = conn;
    this.mqttConn = new MqttConn({ conn });
    this.handlers = handlers;
    this.protocolLevel = MQTTLevel.unknown;
    this.initializePreconnectTimer(Context.preconnectTimeoutMs);
  }

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

  async send(packet: AnyPacket): Promise<void> {
    logger.debug("Sending", PacketNameByType[packet.type]);
    logger.debug(JSON.stringify(packet, null, 2));
    await this.mqttConn.send(packet);
  }

  connect(clientId: string, clean: boolean): void {
    logger.debug("Connecting", clientId);
    const existingSession = Context.clientList.get(clientId);
    if (existingSession) {
      logger.debug(
        `Existing session with ${clientId} exists, closing existing session`,
      );
      existingSession.close(false);
    }

    if (this.preconnectTimer) {
      this.preconnectTimer.clear();
    }

    this.store = this.persistence.registerClient(
      clientId,
      this.doPublish.bind(this),
      clean,
    );
    this.connected = true;
    Context.clientList.set(clientId, this);
    this.broadcast("$SYS/connect/clients", clientId);
    logger.debug("Connected", clientId);
  }

  doPublish(packet: PublishPacket): void {
    const qos = packet.qos || 0;
    if (qos === 0) {
      packet.id = 0;
      this.send(packet);
      return;
    }
    if (this.store) {
      packet.id = this.store.nextId();
      this.store.pendingOutgoing.set(packet.id, packet);
      this.send(packet);
    }
  }

  clean(clientId: string) {
    this.persistence.deregisterClient(clientId);
  }

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
        this.broadcast("$SYS/disconnect/clients", this.store.clientId);
      }
      if (executewill) {
        this.handleWill();
      }
    } else {
      logger.info(
        `closing connection from ${this.mqttConn.remoteAddress} because of "${
          this.mqttConn.reason || "normal disconnect"
        }"`,
      );
    }
    if (!this.mqttConn.isClosed) {
      this.mqttConn.close();
    }
  }

  private handleWill() {
    if (this.will) {
      if (
        !this.will.topic.startsWith(SysPrefix) &&
        this.handlers.isAuthorizedToPublish &&
        this.handlers.isAuthorizedToPublish(this, this.will.topic)
      ) {
        this.persistence.publish(this.will.topic, this.will);
      }
    }
  }

  broadcast(topic: Topic, payload: string, retain = false): void {
    const packet: PublishPacket = {
      type: PacketType.publish,
      protocolLevel: this.protocolLevel,
      topic,
      retain,
      payload: utf8Encoder.encode(payload),
    };
    this.persistence.publish(packet.topic, packet);
  }
}
