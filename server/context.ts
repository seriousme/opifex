import {
  AnyPacket,
  AuthenticationResult,
  IPersistence,
  IStore,
  logger,
  MqttConn,
  PacketType,
  PublishPacket,
  SockConn,
  Timer,
  Topic,
} from "./deps.ts";

export type ClientId = string;

export const SysPrefix = "$";

export const utf8Encoder = new TextEncoder();

export type Handlers = {
  isAuthenticated?(
    ctx: Context,
    clientId: ClientId,
    username: string,
    password: Uint8Array,
  ): AuthenticationResult;
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
  conn: SockConn;
  mqttConn: MqttConn;
  persistence: IPersistence;
  handlers: Handlers;
  static clientList: Map<ClientId, Context> = new Map();
  store?: IStore;
  will?: PublishPacket;
  timer?: Timer;

  constructor(persistence: IPersistence, conn: SockConn, handlers: Handlers) {
    this.persistence = persistence;
    this.connected = false;
    this.conn = conn;
    this.mqttConn = new MqttConn({ conn });
    this.handlers = handlers;
  }

  async send(packet: AnyPacket): Promise<void> {
    logger.debug("Sending", PacketType[packet.type]);
    logger.debug(JSON.stringify(packet, null, 2));
    await this.mqttConn.send(packet);
  }

  connect(clientId: string, clean: boolean): void {
    logger.debug("Connecting", clientId);
    const existingSession = Context.clientList.get(clientId);
    if (existingSession) {
      existingSession.close(false);
    }
    this.store = this.persistence.registerClient(
      clientId,
      this.doPublish.bind(this),
      clean,
    );

    this.connected = true;
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
    if (this.connected) {
      logger.debug(
        `Closing ${this.store?.clientId} while mqttConn is ${
          this.mqttConn.isClosed ? "" : "not "
        }closed`,
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
      topic,
      retain,
      payload: utf8Encoder.encode(payload),
    };
    if (packet.retain === true) {
      this.persistence.retained.set(packet.topic, packet);
    }
    this.persistence.publish(packet.topic, packet);
  }
}
