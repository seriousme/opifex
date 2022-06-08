import {
  AnyPacket,
  AuthenticationResult,
  debug,
  MqttConn,
  PacketType,
  Persistence,
  PublishPacket,
  SockConn,
  Store,
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

export class Context {
  connected: boolean;
  conn: SockConn;
  mqttConn: MqttConn;
  persistence: Persistence;
  handlers: Handlers;
  static clientList: Map<ClientId, Context> = new Map();
  store?: Store;
  will?: PublishPacket;
  timer?: Timer;

  constructor(persistence: Persistence, conn: SockConn, handlers: Handlers) {
    this.persistence = persistence;
    this.connected = false;
    this.conn = conn;
    this.mqttConn = new MqttConn({ conn });
    this.handlers = handlers;
  }

  async send(packet: AnyPacket): Promise<void>  {
    debug.log("Sending", PacketType[packet.type]);
    debug.log(JSON.stringify(packet, null, 2));
    await this.mqttConn.send(packet);
  }

  connect(
    clientId: string,
    clean: boolean,
  ): void {
    debug.log("Connecting", clientId);
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
    debug.log("Connected", clientId);
  }

  doPublish(packet: PublishPacket):void {
    debug.log("doPublish", PacketType[packet.type]);
    this.send(packet);
  }

  clean(clientId: string) {
    this.persistence.deregisterClient(clientId);
  }

  close(executewill = true): void {
    if (this.connected) {
      debug.log(
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
